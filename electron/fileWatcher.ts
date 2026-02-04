import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { BrowserWindow } from 'electron';
import { getDatabase } from './database';
import { generateThumbnail } from './thumbnailGenerator';

interface WatchedFolder {
    id: number;
    path: string;
    watcher: any;
}

const watchedFolders: Map<number, WatchedFolder> = new Map();
const SUPPORTED_EXTENSIONS = ['.stl', '.3mf', '.obj'];

/**
 * Start watching a folder for new 3D model files
 */
export function startWatchingFolder(folderId: number, folderPath: string, mainWindow: BrowserWindow | null): void {
    // Don't watch if already watching
    if (watchedFolders.has(folderId)) {
        console.log(`Already watching folder ${folderId}: ${folderPath}`);
        return;
    }

    console.log(`Starting to watch folder ${folderId}: ${folderPath}`);

    // Create watcher with chokidar
    const watcher = chokidar.watch(folderPath, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true, // Don't process existing files on startup
        depth: 99, // Watch subdirectories recursively
        awaitWriteFinish: {
            stabilityThreshold: 2000, // Wait for file to be stable for 2s
            pollInterval: 100
        }
    });

    // Store watcher
    watchedFolders.set(folderId, {
        id: folderId,
        path: folderPath,
        watcher
    });

    // Handle file additions
    watcher.on('add', async (filePath: string) => {
        const ext = path.extname(filePath).toLowerCase();

        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            return;
        }

        console.log(`New file detected: ${filePath}`);

        try {
            await importFile(filePath, folderId);

            // Notify renderer process that models have been updated
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('models-updated');
            }
        } catch (error) {
            console.error(`Failed to import ${filePath}:`, error);
        }
    });

    // Handle file deletions
    watcher.on('unlink', async (filePath: string) => {
        console.log(`File removed: ${filePath}`);

        try {
            await removeFile(filePath);

            // Notify renderer
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('models-updated');
            }
        } catch (error) {
            console.error(`Failed to remove ${filePath}:`, error);
        }
    });

    // Handle errors
    watcher.on('error', (error) => {
        console.error(`Watcher error for ${folderPath}:`, error);
    });

    console.log(`Now watching: ${folderPath}`);
}

/**
 * Stop watching a folder
 */
export async function stopWatchingFolder(folderId: number): Promise<void> {
    const watched = watchedFolders.get(folderId);

    if (watched && watched.watcher) {
        await watched.watcher.close();
        watchedFolders.delete(folderId);
        console.log(`Stopped watching folder ${folderId}: ${watched.path}`);
    }
}

/**
 * Stop watching all folders (on app quit)
 */
export async function stopAllWatchers(): Promise<void> {
    console.log('Stopping all watchers...');

    const promises: Promise<void>[] = [];
    for (const [folderId] of watchedFolders) {
        promises.push(stopWatchingFolder(folderId));
    }

    await Promise.all(promises);
    console.log('All watchers stopped');
}

/**
 * Import a file into the database
 */
async function importFile(filePath: string, collectionId: number): Promise<void> {
    const db = getDatabase();
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1) as 'stl' | '3mf' | 'obj';

    // Check if file already exists
    const existing = db.prepare('SELECT id FROM models WHERE filepath = ?').get(filePath);
    if (existing) {
        console.log(`File already exists in database: ${filename}`);
        return;
    }

    const stats = fs.statSync(filePath);

    const insertModel = db.prepare(`
    INSERT INTO models (filename, filepath, file_size, file_type, collection_id)
    VALUES (?, ?, ?, ?, ?)
  `);

    const result = insertModel.run(filename, filePath, stats.size, ext, collectionId);
    const modelId = result.lastInsertRowid as number;

    console.log(`Imported file ${filename} with ID ${modelId}`);

    // Generate thumbnail asynchronously
    generateThumbnail(filePath, modelId)
        .then(thumbnailPath => {
            db.prepare('UPDATE models SET thumbnail_path = ? WHERE id = ?').run(thumbnailPath, modelId);
            console.log(`Thumbnail generated for ${filename}`);
        })
        .catch(err => {
            console.error(`Failed to generate thumbnail for ${filename}:`, err);
        });
}

/**
 * Remove a file from the database
 */
async function removeFile(filePath: string): Promise<void> {
    const db = getDatabase();

    // Get model ID before deleting
    const model = db.prepare('SELECT id FROM models WHERE filepath = ?').get(filePath) as { id: number } | undefined;

    if (model) {
        // Delete from database (cascade will handle model_tags)
        db.prepare('DELETE FROM models WHERE id = ?').run(model.id);
        console.log(`Removed file from database: ${filePath}`);
    }
}

/**
 * Initialize all watchers from database
 */
export function initializeWatchers(mainWindow: BrowserWindow | null): void {
    const db = getDatabase();
    const watchedCollections = db.prepare(`
    SELECT id, folder_path 
    FROM collections 
    WHERE type = 'watched' AND is_active = 1
  `).all() as Array<{ id: number; folder_path: string }>;

    console.log(`Initializing ${watchedCollections.length} folder watchers...`);

    for (const collection of watchedCollections) {
        if (collection.folder_path && fs.existsSync(collection.folder_path)) {
            startWatchingFolder(collection.id, collection.folder_path, mainWindow);
        } else {
            console.warn(`Watched folder does not exist: ${collection.folder_path}`);
        }
    }
}

/**
 * Get list of currently watched folders
 */
export function getWatchedFolders(): WatchedFolder[] {
    return Array.from(watchedFolders.values());
}
