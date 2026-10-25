/** Data access for AI enrichment. */
import path from 'path';
import { getDatabase } from '../database';
import type { AiEnrichment, FileType, PrintMetadata, SourceMetadata } from '../../src/types';
import { safeJson } from './rows';
import { indexableFolderPath, refreshSearchIndex } from './searchIndex';

// ============ AI enrichment ============

export interface EnrichmentSource {
    filename: string;
    folder: string;
    fileType: FileType;
    dimensionsMm?: { x: number; y: number; z: number };
    triangleCount?: number;
    title?: string;
    designer?: string;
    description?: string;
    source?: string;
    readmeExcerpt?: string;
    existingTags: string[];
}

/** Everything the assistant should know about a model, or null when the model is gone. */
export function getEnrichmentSource(modelId: number): EnrichmentSource | null {
    const db = getDatabase();
    const row = db.prepare(`
        SELECT filename, folder_path, filepath, file_type, bbox_x, bbox_y, bbox_z, triangle_count,
               print_meta, source_metadata, substr(readme_text, 1, 1200) AS readme
        FROM models WHERE id = ?
    `).get(modelId) as {
        filename: string; folder_path: string | null; filepath: string; file_type: FileType;
        bbox_x: number | null; bbox_y: number | null; bbox_z: number | null; triangle_count: number | null;
        print_meta: string | null; source_metadata: string | null; readme: string | null;
    } | undefined;
    if (!row) return null;

    const print = safeJson<PrintMetadata>(row.print_meta) ?? {};
    const source = safeJson<SourceMetadata>(row.source_metadata) ?? {};
    const tags = (db.prepare('SELECT name FROM tags ORDER BY name').all() as Array<{ name: string }>).map((t) => t.name);

    return {
        filename: row.filename,
        folder: indexableFolderPath(row.folder_path ?? path.dirname(row.filepath)),
        fileType: row.file_type,
        dimensionsMm: row.bbox_x !== null && row.bbox_y !== null && row.bbox_z !== null ? { x: row.bbox_x, y: row.bbox_y, z: row.bbox_z } : undefined,
        triangleCount: row.triangle_count ?? undefined,
        title: print.title,
        designer: print.designer ?? source.author,
        description: print.description ?? source.notes,
        source: source.source,
        readmeExcerpt: row.readme ?? undefined,
        existingTags: tags,
    };
}

export function setAiMetadata(modelId: number, enrichment: AiEnrichment | null): void {
    getDatabase()
        .prepare('UPDATE models SET ai_metadata = ?, ai_enriched_at = ? WHERE id = ?')
        .run(enrichment ? JSON.stringify(enrichment) : null, enrichment ? enrichment.generatedAt : null, modelId);
    refreshSearchIndex(modelId);
}

/** Adds the assistant's suggested tags to the model. Returns how many were newly added. */
export function applySuggestedTags(modelId: number): number {
    const db = getDatabase();
    const row = db.prepare('SELECT ai_metadata FROM models WHERE id = ?').get(modelId) as { ai_metadata: string | null } | undefined;
    const enrichment = safeJson<AiEnrichment>(row?.ai_metadata ?? null);
    if (!enrichment?.suggestedTags?.length) return 0;

    let added = 0;
    const findTag = db.prepare('SELECT id FROM tags WHERE lower(name) = lower(?)');
    const link = db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)');
    for (const name of enrichment.suggestedTags) {
        const tag = findTag.get(name) as { id: number } | undefined;
        if (tag && link.run(modelId, tag.id).changes > 0) added++;
    }
    if (added > 0) refreshSearchIndex(modelId);
    return added;
}

/** Categories present in the library, most common first (for the query translator). */
export function listAiCategories(): string[] {
    return (getDatabase().prepare(`
        SELECT json_extract(ai_metadata, '$.category') AS category, COUNT(*) AS n
        FROM models WHERE ai_metadata IS NOT NULL
        GROUP BY category ORDER BY n DESC LIMIT 40
    `).all() as Array<{ category: string | null }>)
        .map((r) => r.category)
        .filter((c): c is string => Boolean(c));
}

export function listTagNames(): string[] {
    return (getDatabase().prepare('SELECT name FROM tags ORDER BY name').all() as Array<{ name: string }>).map((t) => t.name);
}
