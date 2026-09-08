import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import fs from 'fs';
import { getDatabase } from './database';
import {
    fileTypeOf,
    importModel,
    libraryEvents,
    markFolderModelsMissing,
    markModelMissingByPath,
    notifyModelsUpdated,
    SUPPORTED_EXTENSIONS,
} from './library';
import { enqueueModel, dequeueModel } from './indexer';
import { cancelThumbnailRender } from './thumbnails';

interface WatchedFolder {
    id: number;
    path: string;
    watcher: FSWatcher;
}

const AVAILABILITY_POLL_MS = 10_000;

const watchedFolders = new Map<number, WatchedFolder>();
let availabilityTimer: NodeJS.Timeout | null = null;
let availabilityCheckRunning = false;

function isSupported(filePath: string): boolean {
    return SUPPORTED_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

/** Tells the renderer that a watched folder changed state (online/offline). */
function notifyCollectionsUpdated(): void {
    libraryEvents.emit('collections-updated');
}

function handleFileAdded(filePath: string, folderId: number): void {
    if (!isSupported(filePath)) return;
    try {
        const outcome = importModel(filePath, folderId);
        if (outcome) {
            enqueueModel(outcome.id);
            if (outcome.created || outcome.restored) notifyModelsUpdated();
        }
    } catch (error) {
        console.error(`[Watcher] Failed to import ${filePath}:`, error);
    }
}

function handleFileChanged(filePath: string): void {
    if (!isSupported(filePath)) return;
    const row = getDatabase().prepare('SELECT id FROM models WHERE filepath = ?').get(filePath) as { id: number } | undefined;
    if (row) enqueueModel(row.id);
}

/**
 * A file disappeared. It is flagged as missing rather than deleted so that tags, notes and
 * collections survive an unplugged drive or an accidental move.
 */
function handleFileRemoved(filePath: string): void {
    if (!isSupported(filePath)) return;
    const row = getDatabase().prepare('SELECT id FROM models WHERE filepath = ?').get(filePath) as { id: number } | undefined;
    if (!row) return;
    dequeueModel(row.id);
    cancelThumbnailRender(row.id);
    if (markModelMissingByPath(filePath)) notifyModelsUpdated();
}

/**
 * Start watching a folder for 3D model files. Existing files are picked up by
 * `syncFolder`, so the watcher itself ignores the initial scan.
 */
export function startWatchingFolder(folderId: number, folderPath: string): void {
    if (watchedFolders.has(folderId)) return;

    const watcher = chokidar.watch(folderPath, {
        ignored: (p) => path.basename(p).startsWith('.'),
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
    });

    watcher.on('add', (filePath) => handleFileAdded(filePath, folderId));
    watcher.on('change', (filePath) => handleFileChanged(filePath));
    watcher.on('unlink', (filePath) => handleFileRemoved(filePath));
    watcher.on('error', (error) => {
        console.error(`[Watcher] Error for ${folderPath}:`, error);
        // A vanished root (drive unplugged) usually surfaces here first; verify right away instead of waiting for the poll.
        void checkFolderAvailability();
    });

    watchedFolders.set(folderId, { id: folderId, path: folderPath, watcher });
    console.log(`[Watcher] Now watching: ${folderPath}`);
}

export async function stopWatchingFolder(folderId: number): Promise<void> {
    const watched = watchedFolders.get(folderId);
    if (!watched) return;
    watchedFolders.delete(folderId);
    await watched.watcher.close();
}

export async function stopAllWatchers(): Promise<void> {
    if (availabilityTimer) {
        clearInterval(availabilityTimer);
        availabilityTimer = null;
    }
    await Promise.all([...watchedFolders.keys()].map(stopWatchingFolder));
}

export function isFolderWatched(folderId: number): boolean {
    return watchedFolders.has(folderId);
}

/** Recursively lists supported model files without blocking the event loop. */
async function scanDirectory(root: string): Promise<string[]> {
    const found: string[] = [];
    const stack = [root];

    while (stack.length > 0) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch (error) {
            console.warn(`[Sync] Cannot read ${dir}:`, error);
            continue;
        }
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) stack.push(full);
            else if (entry.isFile() && fileTypeOf(full)) found.push(full);
        }
    }

    return found;
}

/**
 * Reconciles the database with the folder on disk: imports new files, restores files that were
 * missing and have reappeared, and flags files that are gone. Nothing is deleted here.
 */
export async function syncFolder(folderId: number, folderPath: string): Promise<{ added: number; restored: number; missing: number }> {
    const db = getDatabase();

    if (!fs.existsSync(folderPath)) {
        const flagged = markFolderModelsMissing(folderId);
        if (flagged > 0) notifyModelsUpdated();
        console.log(`[Sync] ${folderPath}: folder unavailable, ${flagged} models flagged missing`);
        return { added: 0, restored: 0, missing: flagged };
    }

    const diskFiles = new Set(await scanDirectory(folderPath));

    const dbFiles = db.prepare(`
        SELECT m.id, m.filepath, m.missing_since FROM models m
        JOIN model_collections mc ON mc.model_id = m.id
        WHERE mc.collection_id = ?
    `).all(folderId) as Array<{ id: number; filepath: string; missing_since: string | null }>;
    const known = new Map(dbFiles.map((f) => [f.filepath, f]));

    let added = 0;
    let restored = 0;
    const importAll = db.transaction((files: string[]) => {
        const ids: number[] = [];
        for (const file of files) {
            const outcome = importModel(file, folderId);
            if (!outcome) continue;
            if (outcome.created) added++;
            if (outcome.restored) restored++;
            if (outcome.created || outcome.restored) ids.push(outcome.id);
        }
        return ids;
    });
    const toImport = [...diskFiles].filter((f) => {
        const existing = known.get(f);
        return !existing || existing.missing_since !== null;
    });
    for (const id of importAll(toImport)) enqueueModel(id);

    let missing = 0;
    for (const file of dbFiles) {
        if (file.missing_since !== null) continue;
        if (!diskFiles.has(file.filepath) && !fs.existsSync(file.filepath)) {
            handleFileRemoved(file.filepath);
            missing++;
        }
    }

    if (added > 0 || restored > 0 || missing > 0) notifyModelsUpdated();
    console.log(`[Sync] ${folderPath}: +${added} added, ${restored} restored, ${missing} missing`);
    return { added, restored, missing };
}

function activeWatchedFolders(): Array<{ id: number; folder_path: string }> {
    return getDatabase()
        .prepare("SELECT id, folder_path FROM collections WHERE type = 'watched' AND is_active = 1 AND folder_path IS NOT NULL")
        .all() as Array<{ id: number; folder_path: string }>;
}

/**
 * Brings watchers in line with what exists on disk: folders that reappeared (drive plugged back in)
 * are watched and reconciled again; folders that vanished are released and their models flagged.
 */
export async function checkFolderAvailability(): Promise<void> {
    if (availabilityCheckRunning) return;
    availabilityCheckRunning = true;
    try {
        let changed = false;
        for (const folder of activeWatchedFolders()) {
            const online = fs.existsSync(folder.folder_path);
            const watched = watchedFolders.has(folder.id);

            if (online && !watched) {
                console.log(`[Watcher] Folder is back: ${folder.folder_path}`);
                startWatchingFolder(folder.id, folder.folder_path);
                await syncFolder(folder.id, folder.folder_path);
                changed = true;
            } else if (!online && watched) {
                console.warn(`[Watcher] Folder disappeared: ${folder.folder_path}`);
                await stopWatchingFolder(folder.id);
                const flagged = markFolderModelsMissing(folder.id);
                if (flagged > 0) notifyModelsUpdated();
                changed = true;
            }
        }
        if (changed) notifyCollectionsUpdated();
    } finally {
        availabilityCheckRunning = false;
    }
}

/** Starts watchers for every reachable watched folder, flags the rest, and keeps polling for drives coming and going. */
export async function initializeWatchers(): Promise<void> {
    for (const folder of activeWatchedFolders()) {
        if (fs.existsSync(folder.folder_path)) {
            startWatchingFolder(folder.id, folder.folder_path);
            await syncFolder(folder.id, folder.folder_path);
        } else {
            console.warn(`[Watcher] Folder unavailable at startup: ${folder.folder_path}`);
            await syncFolder(folder.id, folder.folder_path); // flags its models as missing
        }
    }

    if (!availabilityTimer) {
        availabilityTimer = setInterval(() => void checkFolderAvailability(), AVAILABILITY_POLL_MS);
    }
}
