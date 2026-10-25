/** Keeping the full-text search index in sync. */
import path from 'path';
import { getDatabase } from '../database';
import { isInsideDir } from '../paths';
import type { AiEnrichment, PrintMetadata, SourceMetadata } from '../../src/types';
import { safeJson } from './rows';

// ============ Search index maintenance ============

/** Folder path relative to the watched folder that contains it, so machine-specific prefixes do not pollute the index. */
export function indexableFolderPath(folderPath: string): string {
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
        SELECT filename, display_name, folder_path, filepath, source_metadata, print_meta, readme_text, ai_metadata
        FROM models WHERE id = ?
    `).get(modelId) as {
        filename: string;
        display_name: string | null;
        folder_path: string | null;
        filepath: string;
        source_metadata: string | null;
        print_meta: string | null;
        readme_text: string | null;
        ai_metadata: string | null;
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
    const ai = safeJson<AiEnrichment>(row.ai_metadata);
    const aiText = ai ? [ai.name, ai.summary, ai.category, ...(ai.keywords ?? [])].filter(Boolean).join(' ') : '';

    db.transaction(() => {
        db.prepare('DELETE FROM models_fts WHERE rowid = ?').run(modelId);
        db.prepare(`
            INSERT INTO models_fts (rowid, filename, display_name, folder_path, tags, source, author, license, notes, title, designer, description, printer, readme, ai)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            aiText,
        );
    })();
}

export function rebuildSearchIndex(): void {
    const db = getDatabase();
    // One transaction for the whole rebuild: per-row commits make large libraries take minutes.
    db.transaction(() => {
        db.exec('DELETE FROM models_fts');
        const ids = db.prepare('SELECT id FROM models').all() as Array<{ id: number }>;
        for (const { id } of ids) refreshSearchIndex(id);
    })();
}
