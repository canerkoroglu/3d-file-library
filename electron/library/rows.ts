/** Mapping database rows to Model objects. */
import path from 'path';
import { getDatabase } from '../database';
import type { AiEnrichment, FileType, Model, ModelWithTags, PrintMetadata, SourceMetadata, Tag, ThumbnailSource } from '../../src/types';

// ============ Row mapping ============

export interface ModelRow {
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
    ai_metadata: string | null;
}

export const MODEL_COLUMNS = `
    m.id, m.filename, m.filepath, m.folder_path, m.display_name, m.file_size, m.file_type,
    m.created_at, m.modified_at, m.thumbnail_path, m.thumbnail_source, m.thumbnail_updated_at,
    m.content_hash, m.triangle_count, m.bbox_x, m.bbox_y, m.bbox_z, m.volume_mm3, m.print_meta,
    (m.readme_text IS NOT NULL) AS has_readme, m.indexed_at, m.missing_since, m.source_metadata, m.ai_metadata
`;

export function safeJson<T>(text: string | null): T | undefined {
    if (!text) return undefined;
    try {
        return JSON.parse(text) as T;
    } catch {
        return undefined;
    }
}

export function rowToModel(row: ModelRow): Model {
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
        aiMetadata: safeJson<AiEnrichment>(row.ai_metadata),
    };
}

/** Attaches tags and collection ids to a list of models with two small queries. */
export function hydrate(models: Model[]): ModelWithTags[] {
    if (models.length === 0) return [];
    const db = getDatabase();

    // Only fetch links for the models being returned (a page is ~100 rows; the library may hold tens of thousands).
    const ids = JSON.stringify(models.map((m) => m.id));

    const tagsByModel = new Map<number, Tag[]>();
    const tagRows = db.prepare(`
        SELECT mt.model_id, t.id, t.name, t.color
        FROM model_tags mt JOIN tags t ON t.id = mt.tag_id
        WHERE mt.model_id IN (SELECT value FROM json_each(?))
        ORDER BY t.name
    `).all(ids) as Array<{ model_id: number; id: number; name: string; color: string }>;
    for (const row of tagRows) {
        const list = tagsByModel.get(row.model_id) ?? [];
        list.push({ id: row.id, name: row.name, color: row.color });
        tagsByModel.set(row.model_id, list);
    }

    const collectionsByModel = new Map<number, number[]>();
    const collectionRows = db.prepare(`
        SELECT model_id, collection_id FROM model_collections
        WHERE model_id IN (SELECT value FROM json_each(?))
    `).all(ids) as Array<{ model_id: number; collection_id: number }>;
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
