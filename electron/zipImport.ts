/**
 * Imports downloaded archives (Thingiverse, Printables, MyMiniFactory zips) into a watched
 * folder. Each archive is extracted into its own sub-folder so READMEs, licenses and preview
 * images stay next to the models where the indexer can find them.
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { getDatabase } from './database';
import { fileTypeOf, importModel, notifyModelsUpdated } from './library';
import { enqueueModel } from './indexer';
import type { ZipImportResult } from '../src/types';

const JUNK_SEGMENTS = new Set(['__MACOSX', '.DS_Store', 'Thumbs.db', 'desktop.ini']);

export function isJunkEntry(name: string): boolean {
    return name.split('/').some((segment) => JUNK_SEGMENTS.has(segment) || segment.startsWith('.'));
}

/** Rejects zip-slip style paths (absolute, drive-rooted or escaping the destination). */
export function safeRelativePath(entryName: string): string | null {
    const normalized = entryName.replace(/\\/g, '/');
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null;
    const segments = normalized.split('/').filter((s) => s.length > 0);
    if (segments.some((s) => s === '..')) return null;
    if (segments.length === 0) return null;
    return segments.join(path.sep);
}

/** Picks a destination folder name that does not exist yet: "name", "name-2", "name-3", … */
async function uniqueDirectory(root: string, stem: string): Promise<string> {
    const base = stem.replace(/[<>:"/\\|?*]/g, '_').trim() || 'import';
    let candidate = path.join(root, base);
    let counter = 2;
    while (fs.existsSync(candidate)) {
        candidate = path.join(root, `${base}-${counter}`);
        counter++;
    }
    return candidate;
}

/** When every entry lives under one top-level directory, strip it to avoid "name/name/files". */
export function commonTopLevel(names: string[]): string | null {
    let common: string | null = null;
    for (const name of names) {
        const top = name.split('/')[0];
        if (!top) return null;
        if (common === null) common = top;
        else if (common !== top) return null;
    }
    // Only strip when the archive actually has nested paths, not a flat list of files.
    return names.every((n) => n.includes('/')) ? common : null;
}

export async function importZipFiles(zipPaths: string[], collectionId: number): Promise<ZipImportResult[]> {
    const collection = getDatabase()
        .prepare("SELECT folder_path FROM collections WHERE id = ? AND type = 'watched' AND is_active = 1")
        .get(collectionId) as { folder_path: string | null } | undefined;
    if (!collection?.folder_path) throw new Error('Destination must be an active watched folder');
    if (!fs.existsSync(collection.folder_path)) throw new Error('The destination folder is not available right now');

    const root = collection.folder_path;
    const results: ZipImportResult[] = [];

    for (const zipPath of zipPaths) {
        const result: ZipImportResult = { zipPath, folder: '', extracted: 0, models: 0, skipped: 0 };
        results.push(result);

        try {
            const zip = await JSZip.loadAsync(await fs.promises.readFile(zipPath));
            const entries = Object.values(zip.files).filter((entry) => !entry.dir && !isJunkEntry(entry.name));
            const strip = commonTopLevel(entries.map((e) => e.name));

            const folder = await uniqueDirectory(root, path.basename(zipPath, path.extname(zipPath)));
            result.folder = folder;
            await fs.promises.mkdir(folder, { recursive: true });

            const modelFiles: string[] = [];
            for (const entry of entries) {
                const name = strip ? entry.name.slice(strip.length + 1) : entry.name;
                const relative = safeRelativePath(name);
                if (!relative) {
                    result.skipped++;
                    continue;
                }
                const target = path.join(folder, relative);
                await fs.promises.mkdir(path.dirname(target), { recursive: true });
                await fs.promises.writeFile(target, await entry.async('nodebuffer'));
                result.extracted++;
                if (fileTypeOf(target)) modelFiles.push(target);
            }

            // Register the models right away instead of waiting for the watcher's write-settle delay.
            for (const file of modelFiles) {
                const outcome = importModel(file, collectionId);
                if (outcome) {
                    enqueueModel(outcome.id);
                    result.models++;
                }
            }
        } catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
            console.error(`[ZipImport] Failed to import ${zipPath}:`, error);
        }
    }

    if (results.some((r) => r.models > 0)) notifyModelsUpdated();
    return results;
}
