import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { getDatabase } from './database';
import { getThumbnailDir, isInsideDir } from './paths';
import { buildFtsMatch, parseSearchQuery } from '../src/lib/searchQuery';
import type {
    AppNotice,
    DuplicateReport,
    FileType,
    FilterOptions,
    LibraryStats,
    Model,
    ModelPage,
    ModelWithTags,
    PrintMetadata,
    SourceMetadata,
    Tag,
    ThumbnailSource,
} from '../src/types';
import type { AnalysisResult } from './analyzers/types';

export const SUPPORTED_EXTENSIONS = ['.stl', '.3mf', '.obj'];

/** Higher wins: a weaker thumbnail never replaces a stronger one. */
export const THUMBNAIL_STRENGTH: Record<ThumbnailSource, number> = {
    capture: 5,
    embedded: 4,
    sidecar: 3,
    render: 2,
    folder: 1,
};

/** Emits 'models-updated' whenever library contents change, and 'notice' for user-facing messages. */
export const libraryEvents = new EventEmitter();

export function notifyModelsUpdated(): void {
    libraryEvents.emit('models-updated');
}

/** Sends a short notification to the user (rendered as a toast). Use sparingly. */
export function notifyUser(notice: AppNotice): void {
    libraryEvents.emit('notice', notice);
}

export function fileTypeOf(filepath: string): FileType | null {
    const ext = path.extname(filepath).toLowerCase();
    if (ext === '.stl') return 'stl';
    if (ext === '.3mf') return '3mf';
    if (ext === '.obj') return 'obj';
    return null;
}

// ============ Row mapping ============

interface ModelRow {
    id: number;
    filename: string;
    filepath: string;
    folder_path: string | null;
    display_name: string | null;
    file_size: number;
    file_type: FileType;
    created_at: string;
    modified_at: string | null;
    thumbnail_path: string | null;
    thumbnail_source: ThumbnailSource | null;
    thumbnail_updated_at: string | null;
    content_hash: string | null;
    triangle_count: number | null;
    bbox_x: number | null;
    bbox_y: number | null;
    bbox_z: number | null;
    volume_mm3: number | null;
    print_meta: string | null;
    has_readme: number;
    indexed_at: string | null;
    missing_since: string | null;
    source_metadata: string | null;
}

const MODEL_COLUMNS = `
    m.id, m.filename, m.filepath, m.folder_path, m.display_name, m.file_size, m.file_type,
    m.created_at, m.modified_at, m.thumbnail_path, m.thumbnail_source, m.thumbnail_updated_at,
    m.content_hash, m.triangle_count, m.bbox_x, m.bbox_y, m.bbox_z, m.volume_mm3, m.print_meta,
    (m.readme_text IS NOT NULL) AS has_readme, m.indexed_at, m.missing_since, m.source_metadata
`;

function safeJson<T>(text: string | null): T | undefined {
    if (!text) return undefined;
    try {
        return JSON.parse(text) as T;
    } catch {
        return undefined;
    }
}

function rowToModel(row: ModelRow): Model {
    return {
        id: row.id,
        filename: row.filename,
        filepath: row.filepath,
        folderPath: row.folder_path ?? path.dirname(row.filepath),
        displayName: row.display_name ?? undefined,
        fileSize: row.file_size,
        fileType: row.file_type,
        collectionIds: [],
        createdAt: row.created_at,
        modifiedAt: row.modified_at ?? undefined,
        thumbnailPath: row.thumbnail_path ?? undefined,
        thumbnailSource: row.thumbnail_source ?? undefined,
        thumbnailUpdatedAt: row.thumbnail_updated_at ?? undefined,
        contentHash: row.content_hash ?? undefined,
        triangleCount: row.triangle_count ?? undefined,
        bbox: row.bbox_x !== null && row.bbox_y !== null && row.bbox_z !== null
            ? { x: row.bbox_x, y: row.bbox_y, z: row.bbox_z }
            : undefined,
        volumeMm3: row.volume_mm3 ?? undefined,
        printMeta: safeJson<PrintMetadata>(row.print_meta),
        hasReadme: row.has_readme === 1,
        indexedAt: row.indexed_at ?? undefined,
        missingSince: row.missing_since ?? undefined,
        sourceMetadata: safeJson<SourceMetadata>(row.source_metadata),
    };
}

/** Attaches tags and collection ids to a list of models with two small queries. */
function hydrate(models: Model[]): ModelWithTags[] {
    if (models.length === 0) return [];
    const db = getDatabase();

    const tagsByModel = new Map<number, Tag[]>();
    const tagRows = db.prepare(`
        SELECT mt.model_id, t.id, t.name, t.color
        FROM model_tags mt JOIN tags t ON t.id = mt.tag_id
        ORDER BY t.name
    `).all() as Array<{ model_id: number; id: number; name: string; color: string }>;
    for (const row of tagRows) {
        const list = tagsByModel.get(row.model_id) ?? [];
        list.push({ id: row.id, name: row.name, color: row.color });
        tagsByModel.set(row.model_id, list);
    }

    const collectionsByModel = new Map<number, number[]>();
    const collectionRows = db.prepare('SELECT model_id, collection_id FROM model_collections').all() as Array<{ model_id: number; collection_id: number }>;
    for (const row of collectionRows) {
        const list = collectionsByModel.get(row.model_id) ?? [];
        list.push(row.collection_id);
        collectionsByModel.set(row.model_id, list);
    }

    return models.map((model) => ({
        ...model,
        tags: tagsByModel.get(model.id) ?? [],
        collectionIds: collectionsByModel.get(model.id) ?? [],
    }));
}

// ============ Query building ============

function escapeLike(term: string): string {
    return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Builds the SQL for a filtered, sorted model listing. Pure so it can be unit tested.
 * Free text goes through the FTS5 trigram index; terms shorter than three characters fall back to LIKE.
 */
export interface ModelsQuery {
    sql: string;
    params: unknown[];
    /** Counts every match for the same filters, ignoring limit and offset. */
    countSql: string;
    countParams: unknown[];
}

export function buildModelsQuery(filters: FilterOptions = {}): ModelsQuery {
    const parsed = parseSearchQuery(filters.searchQuery ?? '');
    const { match, shortTerms } = buildFtsMatch(parsed.terms);

    const params: unknown[] = [];
    const conditions: string[] = [];
    let ftsJoin = '';

    if (match) {
        // Weights follow the column order of models_fts:
        // filename, display_name, folder_path, tags, source, author, license, notes, title, designer, description, printer, readme
        ftsJoin = `JOIN (
            SELECT rowid AS fts_id, bm25(models_fts, 10.0, 10.0, 5.0, 4.0, 2.0, 3.0, 1.0, 1.5, 6.0, 3.0, 1.5, 2.0, 0.5) AS rank
            FROM models_fts WHERE models_fts MATCH ?
        ) r ON r.fts_id = m.id`;
        params.push(match);
    }

    for (const term of shortTerms) {
        const pattern = `%${escapeLike(term)}%`;
        conditions.push(`(m.filename LIKE ? ESCAPE '\\' OR m.display_name LIKE ? ESCAPE '\\' OR m.folder_path LIKE ? ESCAPE '\\')`);
        params.push(pattern, pattern, pattern);
    }

    if (filters.collectionId) {
        conditions.push('m.id IN (SELECT model_id FROM model_collections WHERE collection_id = ?)');
        params.push(filters.collectionId);
    }

    const fileTypes = filters.fileType ? [filters.fileType] : parsed.fileTypes;
    if (fileTypes.length > 0) {
        conditions.push(`m.file_type IN (${fileTypes.map(() => '?').join(',')})`);
        params.push(...fileTypes);
    }

    if (filters.tagIds && filters.tagIds.length > 0) {
        conditions.push(`m.id IN (
            SELECT model_id FROM model_tags
            WHERE tag_id IN (${filters.tagIds.map(() => '?').join(',')})
            GROUP BY model_id HAVING COUNT(DISTINCT tag_id) = ?
        )`);
        params.push(...filters.tagIds, filters.tagIds.length);
    }

    for (const tagName of parsed.tags) {
        conditions.push('m.id IN (SELECT mt.model_id FROM model_tags mt JOIN tags t ON t.id = mt.tag_id WHERE lower(t.name) = ?)');
        params.push(tagName.toLowerCase());
    }

    if (parsed.source) {
        conditions.push(`json_extract(m.source_metadata, '$.source') LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLike(parsed.source)}%`);
    }

    if (parsed.author) {
        const pattern = `%${escapeLike(parsed.author)}%`;
        conditions.push(`(json_extract(m.source_metadata, '$.author') LIKE ? ESCAPE '\\' OR json_extract(m.print_meta, '$.designer') LIKE ? ESCAPE '\\')`);
        params.push(pattern, pattern);
    }

    if (parsed.license) {
        const pattern = `%${escapeLike(parsed.license)}%`;
        conditions.push(`(json_extract(m.source_metadata, '$.license') LIKE ? ESCAPE '\\' OR json_extract(m.print_meta, '$.license') LIKE ? ESCAPE '\\')`);
        params.push(pattern, pattern);
    }

    if (parsed.minTriangles !== undefined) {
        conditions.push('m.triangle_count >= ?');
        params.push(parsed.minTriangles);
    }
    if (parsed.maxTriangles !== undefined) {
        conditions.push('m.triangle_count <= ?');
        params.push(parsed.maxTriangles);
    }
    if (parsed.minSizeMm !== undefined) {
        conditions.push('max(m.bbox_x, m.bbox_y, m.bbox_z) >= ?');
        params.push(parsed.minSizeMm);
    }
    if (parsed.maxSizeMm !== undefined) {
        conditions.push('max(m.bbox_x, m.bbox_y, m.bbox_z) <= ?');
        params.push(parsed.maxSizeMm);
    }
    if (parsed.hasThumbnail) conditions.push('m.thumbnail_path IS NOT NULL');
    if (parsed.hasReadme) conditions.push('m.readme_text IS NOT NULL');
    if (parsed.missing === true) conditions.push('m.missing_since IS NOT NULL');
    if (parsed.missing === false) conditions.push('m.missing_since IS NULL');

    const direction = (filters.sortOrder ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const sortBy = filters.sortBy ?? (match ? 'relevance' : 'created');
    let orderBy: string;
    switch (sortBy) {
        case 'relevance':
            orderBy = match ? 'r.rank ASC, m.created_at DESC' : 'm.created_at DESC';
            break;
        case 'name':
            orderBy = `lower(COALESCE(m.display_name, m.filename)) ${direction}`;
            break;
        case 'modified':
            orderBy = `m.modified_at IS NULL, m.modified_at ${direction}`;
            break;
        case 'size':
            orderBy = `m.file_size ${direction}`;
            break;
        case 'triangles':
            orderBy = `m.triangle_count IS NULL, m.triangle_count ${direction}`;
            break;
        case 'created':
        default:
            orderBy = `m.created_at ${direction}`;
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) AS total FROM models m ${ftsJoin}${where}`;
    const countParams = [...params];

    let sql = `SELECT ${MODEL_COLUMNS} FROM models m ${ftsJoin}${where}`;
    // Files that are currently unavailable sink to the end of every listing.
    sql += ` ORDER BY (m.missing_since IS NOT NULL), ${orderBy}, m.id DESC`;
    if (filters.limit && filters.limit > 0) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
        if (filters.offset && filters.offset > 0) {
            sql += ' OFFSET ?';
            params.push(filters.offset);
        }
    }

    const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
    return { sql: squash(sql), params, countSql: squash(countSql), countParams };
}

export function getModels(filters: FilterOptions = {}): ModelWithTags[] {
    const db = getDatabase();
    const { sql, params } = buildModelsQuery(filters);
    const rows = db.prepare(sql).all(...params) as ModelRow[];
    return hydrate(rows.map(rowToModel));
}

export function getModelsPage(filters: FilterOptions = {}): ModelPage {
    const db = getDatabase();
    const query = buildModelsQuery(filters);
    const rows = db.prepare(query.sql).all(...query.params) as ModelRow[];
    const { total } = db.prepare(query.countSql).get(...query.countParams) as { total: number };
    return { items: hydrate(rows.map(rowToModel)), total, offset: filters.offset ?? 0 };
}

export function getModel(id: number): ModelWithTags | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT ${MODEL_COLUMNS} FROM models m WHERE m.id = ?`).get(id) as ModelRow | undefined;
    if (!row) return null;
    return hydrate([rowToModel(row)])[0];
}

export function getModelReadme(id: number): string | null {
    const row = getDatabase().prepare('SELECT readme_text FROM models WHERE id = ?').get(id) as { readme_text: string | null } | undefined;
    return row?.readme_text ?? null;
}

// ============ Search index maintenance ============

/** Folder path relative to the watched folder that contains it, so machine-specific prefixes do not pollute the index. */
function indexableFolderPath(folderPath: string): string {
    const roots = getDatabase()
        .prepare("SELECT folder_path FROM collections WHERE type = 'watched' AND folder_path IS NOT NULL")
        .all() as Array<{ folder_path: string }>;

    let best: string | null = null;
    for (const { folder_path } of roots) {
        if (folderPath === folder_path || isInsideDir(folder_path, folderPath)) {
            if (!best || folder_path.length > best.length) best = folder_path;
        }
    }

    if (best) {
        const rel = path.relative(best, folderPath);
        return [path.basename(best), rel].filter(Boolean).join('/').replace(/\\/g, '/');
    }
    return folderPath.split(/[\\/]/).filter(Boolean).slice(-3).join('/');
}

export function refreshSearchIndex(modelId: number): void {
    const db = getDatabase();
    const row = db.prepare(`
        SELECT filename, display_name, folder_path, filepath, source_metadata, print_meta, readme_text
        FROM models WHERE id = ?
    `).get(modelId) as {
        filename: string;
        display_name: string | null;
        folder_path: string | null;
        filepath: string;
        source_metadata: string | null;
        print_meta: string | null;
        readme_text: string | null;
    } | undefined;

    if (!row) {
        db.prepare('DELETE FROM models_fts WHERE rowid = ?').run(modelId);
        return;
    }

    const tags = (db.prepare('SELECT t.name FROM model_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.model_id = ?').all(modelId) as Array<{ name: string }>)
        .map((t) => t.name)
        .join(' ');
    const source = safeJson<SourceMetadata>(row.source_metadata) ?? {};
    const print = safeJson<PrintMetadata>(row.print_meta) ?? {};
    const printer = [print.slicer, print.printerModel, ...(print.filamentTypes ?? [])].filter(Boolean).join(' ');

    db.transaction(() => {
        db.prepare('DELETE FROM models_fts WHERE rowid = ?').run(modelId);
        db.prepare(`
            INSERT INTO models_fts (rowid, filename, display_name, folder_path, tags, source, author, license, notes, title, designer, description, printer, readme)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            modelId,
            path.basename(row.filename, path.extname(row.filename)),
            row.display_name ?? '',
            indexableFolderPath(row.folder_path ?? path.dirname(row.filepath)),
            tags,
            source.source ?? '',
            source.author ?? '',
            source.license ?? print.license ?? '',
            source.notes ?? '',
            print.title ?? '',
            print.designer ?? '',
            print.description ?? '',
            printer,
            row.readme_text ?? '',
        );
    })();
}

export function rebuildSearchIndex(): void {
    const db = getDatabase();
    db.exec('DELETE FROM models_fts');
    const ids = db.prepare('SELECT id FROM models').all() as Array<{ id: number }>;
    for (const { id } of ids) refreshSearchIndex(id);
}

// ============ Imports and removals ============

export interface ImportOutcome {
    id: number;
    created: boolean;
    /** True when a previously missing file came back. */
    restored: boolean;
}

export function importModel(filepath: string, collectionId: number | null): ImportOutcome | null {
    const fileType = fileTypeOf(filepath);
    if (!fileType) return null;

    const db = getDatabase();
    const existing = db.prepare('SELECT id, missing_since FROM models WHERE filepath = ?').get(filepath) as
        | { id: number; missing_since: string | null }
        | undefined;
    if (existing) {
        if (collectionId) {
            db.prepare('INSERT OR IGNORE INTO model_collections (model_id, collection_id) VALUES (?, ?)').run(existing.id, collectionId);
        }
        const restored = existing.missing_since !== null;
        if (restored) markModelAvailable(existing.id);
        return { id: existing.id, created: false, restored };
    }

    const stats = fs.statSync(filepath);
    const now = new Date().toISOString();
    const id = db.transaction(() => {
        const result = db.prepare(`
            INSERT INTO models (filename, filepath, folder_path, file_size, file_type, created_at, modified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(path.basename(filepath), filepath, path.dirname(filepath), stats.size, fileType, now, stats.mtime.toISOString());
        const modelId = result.lastInsertRowid as number;
        if (collectionId) {
            db.prepare('INSERT OR IGNORE INTO model_collections (model_id, collection_id) VALUES (?, ?)').run(modelId, collectionId);
        }
        return modelId;
    })();

    refreshSearchIndex(id);
    return { id, created: true, restored: false };
}

// ============ Missing files ============

/**
 * Flags a model whose file cannot be found. Nothing is deleted: tags, notes, collections and the
 * thumbnail survive until the file comes back or the user chooses to forget it.
 */
export function markModelMissing(modelId: number): boolean {
    const result = getDatabase()
        .prepare('UPDATE models SET missing_since = ? WHERE id = ? AND missing_since IS NULL')
        .run(new Date().toISOString(), modelId);
    return result.changes > 0;
}

export function markModelMissingByPath(filepath: string): boolean {
    const row = getDatabase().prepare('SELECT id FROM models WHERE filepath = ?').get(filepath) as { id: number } | undefined;
    return row ? markModelMissing(row.id) : false;
}

export function markModelAvailable(modelId: number): boolean {
    const result = getDatabase().prepare('UPDATE models SET missing_since = NULL WHERE id = ? AND missing_since IS NOT NULL').run(modelId);
    return result.changes > 0;
}

/** Flags every model of a watched folder as missing (the folder itself is gone, e.g. a drive was unplugged). */
export function markFolderModelsMissing(collectionId: number): number {
    const result = getDatabase().prepare(`
        UPDATE models SET missing_since = ?
        WHERE missing_since IS NULL
          AND id IN (SELECT model_id FROM model_collections WHERE collection_id = ?)
    `).run(new Date().toISOString(), collectionId);
    return result.changes;
}

/** Permanently removes every model whose file is missing. Returns how many were removed. */
export function forgetMissingModels(): number {
    const rows = getDatabase().prepare('SELECT id FROM models WHERE missing_since IS NOT NULL').all() as Array<{ id: number }>;
    for (const { id } of rows) deleteModel(id);
    return rows.length;
}

export function getLibraryStats(): LibraryStats {
    const row = getDatabase()
        .prepare('SELECT COUNT(*) AS models, SUM(missing_since IS NOT NULL) AS missing FROM models')
        .get() as { models: number; missing: number | null };
    return { models: row.models, missing: row.missing ?? 0 };
}

function deleteThumbnailFile(thumbnailPath: string | null): void {
    if (!thumbnailPath) return;
    if (!isInsideDir(getThumbnailDir(), thumbnailPath)) return;
    try {
        fs.unlinkSync(thumbnailPath);
    } catch {
        // already gone
    }
}

/** Removes a model from the library. The file on disk is never touched. */
export function deleteModel(modelId: number): void {
    const db = getDatabase();
    const row = db.prepare('SELECT thumbnail_path FROM models WHERE id = ?').get(modelId) as { thumbnail_path: string | null } | undefined;
    if (!row) return;
    db.transaction(() => {
        db.prepare('DELETE FROM models WHERE id = ?').run(modelId);
        db.prepare('DELETE FROM models_fts WHERE rowid = ?').run(modelId);
    })();
    deleteThumbnailFile(row.thumbnail_path);
}

export function removeModelByPath(filepath: string): boolean {
    const row = getDatabase().prepare('SELECT id FROM models WHERE filepath = ?').get(filepath) as { id: number } | undefined;
    if (!row) return false;
    deleteModel(row.id);
    return true;
}

/** Removes every model that belongs to the watched folder and no other collection. */
export function removeModelsOfWatchedFolder(collectionId: number): number {
    const db = getDatabase();
    const rows = db.prepare(`
        SELECT mc.model_id AS id FROM model_collections mc
        WHERE mc.collection_id = ?
          AND NOT EXISTS (
              SELECT 1 FROM model_collections other
              JOIN collections c ON c.id = other.collection_id
              WHERE other.model_id = mc.model_id AND other.collection_id != ? AND c.type = 'watched' AND c.is_active = 1
          )
    `).all(collectionId, collectionId) as Array<{ id: number }>;

    for (const { id } of rows) deleteModel(id);
    db.prepare('DELETE FROM model_collections WHERE collection_id = ?').run(collectionId);
    return rows.length;
}

// ============ Updates ============

export function setThumbnail(modelId: number, thumbnailPath: string, source: ThumbnailSource): void {
    getDatabase()
        .prepare('UPDATE models SET thumbnail_path = ?, thumbnail_source = ?, thumbnail_updated_at = ? WHERE id = ?')
        .run(thumbnailPath, source, new Date().toISOString(), modelId);
}

export function thumbnailStrengthOf(modelId: number): number {
    const row = getDatabase().prepare('SELECT thumbnail_path, thumbnail_source FROM models WHERE id = ?').get(modelId) as
        | { thumbnail_path: string | null; thumbnail_source: ThumbnailSource | null }
        | undefined;
    if (!row || !row.thumbnail_path) return 0;
    if (!fs.existsSync(row.thumbnail_path)) return 0;
    return row.thumbnail_source ? THUMBNAIL_STRENGTH[row.thumbnail_source] ?? 0 : 0;
}

export function applyAnalysis(modelId: number, result: AnalysisResult): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    if (result.unchanged) {
        db.prepare('UPDATE models SET indexed_at = COALESCE(indexed_at, ?) WHERE id = ?').run(now, modelId);
        return;
    }

    const existing = db.prepare('SELECT source_metadata FROM models WHERE id = ?').get(modelId) as { source_metadata: string | null } | undefined;
    if (!existing) return;

    // Fill in detected license and source only where the user has not set them.
    const source = safeJson<SourceMetadata>(existing.source_metadata) ?? {};
    if (result.license && !source.license) source.license = result.license;
    if (result.sourceSite && !source.source) source.source = result.sourceSite;
    if (result.sourceUrl && !source.url) source.url = result.sourceUrl;

    db.transaction(() => {
        db.prepare(`
            UPDATE models SET
                file_size = ?, modified_at = ?,
                content_hash = ?, hash_mtime_ms = ?, hash_size = ?,
                triangle_count = ?, bbox_x = ?, bbox_y = ?, bbox_z = ?, volume_mm3 = ?,
                print_meta = ?, readme_text = ?, source_metadata = ?, indexed_at = ?
            WHERE id = ?
        `).run(
            result.size,
            new Date(result.mtimeMs).toISOString(),
            result.hash,
            Math.floor(result.mtimeMs),
            result.size,
            result.geometry?.triangleCount ?? null,
            result.geometry?.bbox.x ?? null,
            result.geometry?.bbox.y ?? null,
            result.geometry?.bbox.z ?? null,
            result.geometry?.volume ?? null,
            result.printMeta ? JSON.stringify(result.printMeta) : null,
            result.readme,
            Object.keys(source).length > 0 ? JSON.stringify(source) : null,
            now,
            modelId,
        );

        if (result.thumbnail) {
            setThumbnail(modelId, result.thumbnail.path, result.thumbnail.source);
        }
    })();

    refreshSearchIndex(modelId);
}

export function updateSourceMetadata(modelId: number, metadata: SourceMetadata): void {
    const cleaned: SourceMetadata = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === 'string' && value.trim()) (cleaned as Record<string, string>)[key] = value.trim();
    }
    getDatabase()
        .prepare('UPDATE models SET source_metadata = ? WHERE id = ?')
        .run(Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null, modelId);
    refreshSearchIndex(modelId);
}

export async function renameModelFile(modelId: number, newName: string): Promise<void> {
    const db = getDatabase();
    const model = db.prepare('SELECT filepath FROM models WHERE id = ?').get(modelId) as { filepath: string } | undefined;
    if (!model) throw new Error('Model not found');

    const oldPath = model.filepath;
    if (!fs.existsSync(oldPath)) throw new Error('File not found on disk');

    const dir = path.dirname(oldPath);
    const ext = path.extname(oldPath);
    let safeName = newName.trim().replace(/[<>:"/\\|?*]/g, '_');
    if (!safeName) throw new Error('Name cannot be empty');
    if (!safeName.toLowerCase().endsWith(ext.toLowerCase())) safeName += ext;

    const newPath = path.join(dir, safeName);
    if (newPath === oldPath) return;
    if (fs.existsSync(newPath)) throw new Error('A file with that name already exists');

    await fs.promises.rename(oldPath, newPath);
    db.prepare('UPDATE models SET filename = ?, filepath = ?, modified_at = ? WHERE id = ?')
        .run(safeName, newPath, new Date().toISOString(), modelId);
    refreshSearchIndex(modelId);
}

// ============ Duplicates ============

export function findDuplicates(): DuplicateReport {
    const db = getDatabase();
    const hashes = db.prepare(`
        SELECT content_hash FROM models
        WHERE content_hash IS NOT NULL AND missing_since IS NULL
        GROUP BY content_hash HAVING COUNT(*) > 1
    `).all() as Array<{ content_hash: string }>;

    const byHash = db.prepare(`SELECT ${MODEL_COLUMNS} FROM models m WHERE m.content_hash = ? AND m.missing_since IS NULL ORDER BY m.created_at ASC`);
    const groups = hashes.map(({ content_hash }) => {
        const models = (byHash.all(content_hash) as ModelRow[]).map(rowToModel);
        return {
            hash: content_hash,
            models,
            totalSize: models.reduce((sum, m) => sum + m.fileSize, 0),
        };
    });
    groups.sort((a, b) => b.totalSize - a.totalSize);

    const totalWasted = groups.reduce((sum, g) => sum + (g.models.length - 1) * g.models[0].fileSize, 0);
    const unhashed = db.prepare('SELECT COUNT(*) AS count FROM models WHERE content_hash IS NULL AND missing_since IS NULL').get() as { count: number };

    return { groups, totalWasted, groupCount: groups.length, unhashedCount: unhashed.count };
}
