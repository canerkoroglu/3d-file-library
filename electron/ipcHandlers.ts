import { IpcMain, dialog, shell, BrowserWindow, app } from 'electron';
import { getDatabase } from './database';
import type { Model, Tag, Collection, ModelWithTags, FilterOptions } from '../src/types';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { generateThumbnail } from './thumbnailGenerator';
import { startWatchingFolder, stopWatchingFolder } from './fileWatcher';
import { findDuplicates, deleteModel, calculateWastedSpace } from './duplicatesFinder';

export const setupIpcHandlers = (ipcMain: IpcMain, mainWindow: BrowserWindow | null): void => {
    const db = getDatabase();

    // Helper for safe IPC handling
    const handle = <T>(channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<T>) => {
        ipcMain.handle(channel, async (event, ...args) => {
            try {
                return await handler(event, ...args);
            } catch (error) {
                console.error(`IPC Error [${channel}]:`, error);
                throw error; // Re-throw to let renderer handle it if needed
            }
        });
    };

    // ============ File Reading for 3D Models ============

    handle<ArrayBuffer>('read-file-as-buffer', async (_event, filepath: string) => {
        // console.log('Reading file as buffer:', filepath);
        const buffer = await fs.promises.readFile(filepath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    });

    // ============ Model Operations ============

    const getModelsFromDb = (filters?: FilterOptions): ModelWithTags[] => {
        let query = `
      SELECT m.*, 
             GROUP_CONCAT(DISTINCT t.id || ':' || t.name || ':' || t.color) as tags_data,
             GROUP_CONCAT(DISTINCT mc.collection_id) as collection_ids
      FROM models m
      LEFT JOIN model_tags mt ON m.id = mt.model_id
      LEFT JOIN tags t ON mt.tag_id = t.id
      LEFT JOIN model_collections mc ON m.id = mc.model_id
    `;

        const conditions: string[] = [];
        const params: any[] = [];

        if (filters?.collectionId) {
            // Check if the model is in the specific collection using the junction table
            conditions.push('m.id IN (SELECT model_id FROM model_collections WHERE collection_id = ?)');
            params.push(filters.collectionId);
        }

        if (filters?.fileType) {
            conditions.push('m.file_type = ?');
            params.push(filters.fileType);
        }

        if (filters?.searchQuery) {
            conditions.push('(m.filename LIKE ? OR m.display_name LIKE ?)');
            const searchPattern = `%${filters.searchQuery}%`;
            params.push(searchPattern, searchPattern);
        }

        // Tag filtering
        if (filters?.tagIds && filters.tagIds.length > 0) {
            const placeholders = filters.tagIds.map(() => '?').join(',');
            conditions.push(`m.id IN (
                SELECT model_id FROM model_tags 
                WHERE tag_id IN (${placeholders})
                GROUP BY model_id
                HAVING COUNT(DISTINCT tag_id) = ?
             )`);
            params.push(...filters.tagIds, filters.tagIds.length);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY m.id';

        // Add sorting - map frontend values to database columns
        const sortBy = filters?.sortBy || 'created';
        const sortOrder = filters?.sortOrder || 'desc';

        const sortColumnMap: Record<string, string> = {
            'name': 'filename',
            'created': 'created_at',
            'modified': 'modified_at',
            'size': 'file_size'
        };

        const sortColumn = sortColumnMap[sortBy] || 'created_at';
        query += ` ORDER BY m.${sortColumn} ${sortOrder.toUpperCase()}`;

        const rows = db.prepare(query).all(...params) as any[];

        return rows.map(row => {
            const tags: Tag[] = [];
            if (row.tags_data) {
                const tagPairs = row.tags_data.split(',');
                tagPairs.forEach((pair: string) => {
                    const [id, name, color] = pair.split(':');
                    tags.push({ id: parseInt(id), name, color });
                });
            }

            const collectionIds: number[] = [];
            if (row.collection_ids) {
                row.collection_ids.split(',').forEach((id: string) => {
                    collectionIds.push(parseInt(id));
                });
            }

            return {
                id: row.id,
                filename: row.filename,
                filepath: row.filepath,
                displayName: row.display_name,
                fileSize: row.file_size,
                fileType: row.file_type,
                collectionIds, // New property
                createdAt: row.created_at,
                modifiedAt: row.modified_at,
                thumbnailPath: row.thumbnail_path,
                sourceMetadata: row.source_metadata ? JSON.parse(row.source_metadata) : undefined,
                tags
            };
        });
    };

    handle('get-models', async (_event, filters?: FilterOptions): Promise<ModelWithTags[]> => {
        const models = getModelsFromDb(filters);
        // Log the first model to see if thumbnail info is correct
        if (models.length > 0) {
            // console.log(`[IPC] Returning ${models.length} models. First model: ${models[0].filename}, thumb: ${models[0].thumbnailPath}, created: ${models[0].createdAt}`);
        }
        return models;
    });

    handle('search-models', async (_event, query: string): Promise<ModelWithTags[]> => {
        // Get all models first
        // Optimization: In a real app with 10k+ models, we might want to keep the Fuse index in memory
        // rather than rebuilding it on every search. For now, this is simpler and fast enough for < 1000 items.
        const allModels = getModelsFromDb();

        if (!query || query.trim() === '') {
            return allModels;
        }

        const Fuse = (await import('fuse.js')).default;
        const fuse = new Fuse(allModels, {
            keys: [
                'filename',
                'displayName',
                'tags.name',
                'sourceMetadata.source',
                'sourceMetadata.author',
                'sourceMetadata.notes'
            ],
            threshold: 0.4, // Match sensitivity (0.0 = exact, 1.0 = anything)
            distance: 100,
            includeScore: true
        });

        const results = fuse.search(query);
        return results.map(result => result.item);
    });

    handle('import-files', async (event): Promise<Model[]> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showOpenDialog(window!, {
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: '3D Models', extensions: ['stl', '3mf', 'obj'] },
                { name: 'STL Files', extensions: ['stl'] },
                { name: '3MF Files', extensions: ['3mf'] },
                { name: 'OBJ Files', extensions: ['obj'] },
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return [];
        }

        const imported: Model[] = [];
        const insertModel = db.prepare(`
      INSERT OR IGNORE INTO models (filename, filepath, file_size, file_type)
      VALUES (?, ?, ?, ?)
    `);
        const updateThumbnail = db.prepare('UPDATE models SET thumbnail_path = ? WHERE id = ?');

        for (const filepath of result.filePaths) {
            const filename = path.basename(filepath);
            const ext = path.extname(filepath).toLowerCase().slice(1) as 'stl' | '3mf' | 'obj';
            const stats = fs.statSync(filepath);

            const info = insertModel.run(filename, filepath, stats.size, ext);

            if (info.changes > 0) {
                const modelId = info.lastInsertRowid as number;

                imported.push({
                    id: modelId,
                    filename,
                    filepath,
                    fileSize: stats.size,
                    fileType: ext,
                    createdAt: new Date().toISOString()
                });

                // Generate thumbnail asynchronously
                generateThumbnail(filepath, modelId).then(thumbnailPath => {
                    updateThumbnail.run(thumbnailPath, modelId);
                    // console.log(`Thumbnail generated for ${filename}`);
                }).catch(err => {
                    console.error(`Failed to generate thumbnail for ${filename}:`, err);
                });
            }
        }

        return imported;
    });

    handle('delete-file', async (_event, id: number): Promise<void> => {
        // Use the duplicate finder's delete function which handles cleanup
        await deleteModel(id);
    });

    // ============ Tag Operations ============

    handle('get-tags', async (): Promise<Tag[]> => {
        const rows = db.prepare('SELECT * FROM tags ORDER BY name').all();
        return rows as Tag[];
    });

    handle('create-tag', async (_event, name: string, color: string): Promise<Tag> => {
        const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color);
        return {
            id: result.lastInsertRowid as number,
            name,
            color
        };
    });

    handle('add-tag-to-model', async (_event, modelId: number, tagId: number): Promise<void> => {
        db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)').run(modelId, tagId);
    });

    handle('remove-tag-from-model', async (_event, modelId: number, tagId: number): Promise<void> => {
        db.prepare('DELETE FROM model_tags WHERE model_id = ? AND tag_id = ?').run(modelId, tagId);
    });

    // ============ Collection Operations ============

    handle('get-collections', async (): Promise<Collection[]> => {
        const rows = db.prepare('SELECT * FROM collections WHERE is_active = 1 ORDER BY name').all();
        return rows.map(row => ({
            id: (row as any).id,
            name: (row as any).name,
            type: (row as any).type,
            folderPath: (row as any).folder_path,
            isActive: (row as any).is_active === 1
        }));
    });

    handle('create-collection', async (_event, name: string): Promise<Collection> => {
        const result = db.prepare('INSERT INTO collections (name, type) VALUES (?, ?)').run(name, 'collection');
        return {
            id: result.lastInsertRowid as number,
            name,
            type: 'collection',
            isActive: true
        };
    });

    handle('delete-collection', async (_event, id: number): Promise<void> => {
        // Remove relationships from model_collections
        db.prepare('DELETE FROM model_collections WHERE collection_id = ?').run(id);
        // Delete the collection itself
        db.prepare('DELETE FROM collections WHERE id = ?').run(id);
    });

    handle('rename-collection', async (_event, id: number, newName: string): Promise<void> => {
        db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(newName, id);
    });

    handle('add-watched-folder', async (event, folderPath?: string): Promise<Collection> => {
        console.log('IPC: add-watched-folder called', { folderPath });
        if (!folderPath) {
            const window = BrowserWindow.fromWebContents(event.sender);
            const result = await dialog.showOpenDialog(window!, {
                properties: ['openDirectory']
            });

            if (result.canceled || result.filePaths.length === 0) {
                throw new Error('No folder selected');
            }

            folderPath = result.filePaths[0];
        }

        const name = path.basename(folderPath);
        const insertResult = db.prepare('INSERT INTO collections (name, type, folder_path) VALUES (?, ?, ?)').run(name, 'watched', folderPath);
        const collectionId = insertResult.lastInsertRowid as number;

        // Start watching this folder
        const window = BrowserWindow.fromWebContents(event.sender);
        startWatchingFolder(collectionId, folderPath, window);

        return {
            id: insertResult.lastInsertRowid as number,
            name,
            type: 'watched',
            folderPath,
            isActive: true
        };
    });

    handle('remove-watched-folder', async (_event, id: number): Promise<void> => {
        // Get all models from this collection before deleting
        const models = db.prepare('SELECT id, thumbnail_path FROM models WHERE collection_id = ?').all(id) as Array<{ id: number; thumbnail_path: string | null }>;

        // Delete only thumbnails from filesystem (not the original model files)
        for (const model of models) {
            if (model.thumbnail_path && fs.existsSync(model.thumbnail_path)) {
                try {
                    fs.unlinkSync(model.thumbnail_path);
                    console.log(`Deleted thumbnail: ${model.thumbnail_path}`);
                } catch (error) {
                    console.error(`Failed to delete thumbnail: ${model.thumbnail_path}`, error);
                }
            }
        }

        // Delete all models from database (but original files remain on disk)
        db.prepare('DELETE FROM models WHERE collection_id = ?').run(id);
        console.log(`Removed ${models.length} models from database (original files kept)`);

        // Stop watching the folder
        await stopWatchingFolder(id);

        // Mark collection as inactive in database
        db.prepare('UPDATE collections SET is_active = 0 WHERE id = ?').run(id);

        // Notify renderer to refresh
        if (mainWindow) {
            console.log(`[IPC] Sending 'models-updated' event after removing folder ${id}`);
            mainWindow.webContents.send('models-updated');
        } else {
            console.error('[IPC] Cannot send models-updated: mainWindow is null');
        }
    });

    handle('add-model-to-collection', async (_event, modelId: number, collectionId: number): Promise<void> => {
        // Insert if not exists
        db.prepare('INSERT OR IGNORE INTO model_collections (model_id, collection_id) VALUES (?, ?)').run(modelId, collectionId);
        // console.log(`[IPC] Added model ${modelId} to collection ${collectionId}`);
    });

    handle('remove-model-from-collection', async (_event, modelId: number, collectionId: number): Promise<void> => {
        db.prepare('DELETE FROM model_collections WHERE model_id = ? AND collection_id = ?').run(modelId, collectionId);
        // console.log(`[IPC] Removed model ${modelId} from collection ${collectionId}`);
    });

    handle('refresh-watched-folders', async (): Promise<void> => {
        // Get all active watched folders
        const collections = db.prepare('SELECT id, folder_path FROM collections WHERE type = ? AND is_active = 1').all('watched') as Array<{ id: number; folder_path: string }>;

        console.log(`[IPC] Refreshing ${collections.length} watched folders...`);

        // Dynamic import
        const { syncFolder, stopWatchingFolder: stopWatch, startWatchingFolder: startWatch } = await import('./fileWatcher');

        for (const collection of collections) {
            await stopWatch(collection.id);
            startWatch(collection.id, collection.folder_path, mainWindow);
            await syncFolder(collection.id, collection.folder_path);
        }

        console.log('[IPC] All watched folders refreshed');
    });

    // ============ Thumbnail Operations ============
    handle('capture-thumbnail', async (_event, modelId: number, imageData: string): Promise<void> => {
        const thumbnailPath = path.join(app.getPath('userData'), 'thumbnails', `${modelId}.png`);

        // Ensure thumbnails directory exists
        const thumbnailDir = path.dirname(thumbnailPath);
        if (!fs.existsSync(thumbnailDir)) {
            fs.mkdirSync(thumbnailDir, { recursive: true });
        }

        // Convert base64 to buffer and save
        const buffer = Buffer.from(imageData, 'base64');
        await sharp(buffer)
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 35, g: 35, b: 35, alpha: 1 }
            })
            .png()
            .toFile(thumbnailPath);

        // Update database with new thumbnail path and update timestamp to bust cache
        // Use milliseconds to ensure uniqueness
        const now = new Date().toISOString();
        db.prepare('UPDATE models SET thumbnail_path = ?, created_at = ? WHERE id = ?').run(thumbnailPath, now, modelId);

        console.log(`Updated model ${modelId} with new thumbnail and timestamp: ${now}`);

        // Notify renderer to refresh
        if (mainWindow) {
            mainWindow.webContents.send('models-updated');
        }
    });

    // ============ Slicer Operations ============

    handle('get-slicers', async () => {
        // TODO: Implement slicer detection
        return [];
    });

    handle('open-in-slicer', async (_event, modelPath: string, slicerId: string) => {
        console.log('Open in slicer:', modelPath, slicerId);
        // For now, just open with the default associated application
        // In the future, we can try to spawn specific slicer executables with the file path
        await shell.openPath(modelPath);
    });

    // ============ Utility Operations ============

    handle('open-folder', async (_event, filePath: string): Promise<void> => {
        // showItemInFolder highlights the file in Explorer/Finder
        shell.showItemInFolder(filePath);
    });

    handle('find-duplicates', async () => {
        return await findDuplicates();
    });

    handle('calculate-wasted-space', async () => {
        return await calculateWastedSpace();
    });

    handle('update-model-metadata', async (_event, modelId: number, metadata: Record<string, any>) => {
        const db = getDatabase();
        const metadataJson = JSON.stringify(metadata);
        db.prepare('UPDATE models SET source_metadata = ? WHERE id = ?').run(metadataJson, modelId);

        // Notify renderer of update
        if (mainWindow) {
            mainWindow.webContents.send('models-updated');
        }
    });
};
