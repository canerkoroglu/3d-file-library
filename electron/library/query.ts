/** Building and running model list queries. */
import { getDatabase } from '../database';
import { buildFtsMatch, parseSearchQuery } from '../../src/lib/searchQuery';
import type { FilterOptions, ModelPage, ModelWithTags } from '../../src/types';
import { MODEL_COLUMNS, hydrate, rowToModel } from './rows';
import type { ModelRow } from './rows';

// ============ Query building ============

export function escapeLike(term: string): string {
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
        // filename, display_name, folder_path, tags, source, author, license, notes, title, designer, description, printer, readme, ai
        ftsJoin = `JOIN (
            SELECT rowid AS fts_id, bm25(models_fts, 10.0, 10.0, 5.0, 4.0, 2.0, 3.0, 1.0, 1.5, 6.0, 3.0, 1.5, 2.0, 0.5, 4.0) AS rank
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
    if (parsed.category) {
        conditions.push(`json_extract(m.ai_metadata, '$.category') LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLike(parsed.category)}%`);
    }
    if (parsed.addedAfter) {
        conditions.push('m.created_at >= ?');
        params.push(parsed.addedAfter);
    }
    if (parsed.addedBefore) {
        conditions.push('m.created_at < ?');
        params.push(parsed.addedBefore);
    }
    if (parsed.modifiedAfter) {
        conditions.push('m.modified_at >= ?');
        params.push(parsed.modifiedAfter);
    }
    if (parsed.modifiedBefore) {
        conditions.push('m.modified_at < ?');
        params.push(parsed.modifiedBefore);
    }

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
