/** Applying analysis results, thumbnails, metadata and renames. */
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database';
import type { SourceMetadata, ThumbnailSource } from '../../src/types';
import type { AnalysisResult } from '../analyzers/types';
import { THUMBNAIL_STRENGTH } from './core';
import { safeJson } from './rows';
import { refreshSearchIndex } from './searchIndex';

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

export async function isSameFile(a: string, b: string): Promise<boolean> {
    try {
        const [sa, sb] = await Promise.all([fs.promises.stat(a), fs.promises.stat(b)]);
        return sa.ino === sb.ino && sa.dev === sb.dev;
    } catch {
        return false;
    }
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

    // On case-insensitive file systems (Windows, default macOS) "Part.stl" -> "part.stl" points at the
    // same file, so existsSync() is true. Only reject when the target is genuinely a different file.
    const caseOnlyChange = newPath.toLowerCase() === oldPath.toLowerCase();
    if (!caseOnlyChange && fs.existsSync(newPath)) throw new Error('A file with that name already exists');
    if (caseOnlyChange && fs.existsSync(newPath) && !(await isSameFile(oldPath, newPath))) {
        throw new Error('A file with that name already exists');
    }

    if (caseOnlyChange) {
        // Some file systems ignore a rename that only changes case; go through a temporary name.
        const temp = path.join(dir, `.${safeName}.${process.pid}.${Date.now()}.renaming`);
        await fs.promises.rename(oldPath, temp);
        try {
            await fs.promises.rename(temp, newPath);
        } catch (error) {
            await fs.promises.rename(temp, oldPath).catch(() => undefined);
            throw error;
        }
    } else {
        await fs.promises.rename(oldPath, newPath);
    }
    db.prepare('UPDATE models SET filename = ?, filepath = ?, modified_at = ? WHERE id = ?')
        .run(safeName, newPath, new Date().toISOString(), modelId);
    refreshSearchIndex(modelId);
}
