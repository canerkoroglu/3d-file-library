/** Importing, removing and tracking missing model files. */
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database';
import { getThumbnailDir, isInsideDir } from '../paths';
import type { LibraryStats } from '../../src/types';
import { fileTypeOf } from './core';
import { refreshSearchIndex } from './searchIndex';

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

export function deleteThumbnailFile(thumbnailPath: string | null): void {
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
