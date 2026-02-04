import { IpcMain, dialog, shell, BrowserWindow } from 'electron';
import { getDatabase } from './database';
import type { Model, Tag, Collection, ModelWithTags, FilterOptions } from '../src/types';
import path from 'path';
import fs from 'fs';
import { generateThumbnail } from './thumbnailGenerator';
import { startWatchingFolder, stopWatchingFolder } from './fileWatcher';
import { findDuplicates, deleteModel, calculateWastedSpace } from './duplicatesFinder';

export const setupIpcHandlers = (ipcMain: IpcMain): void => {
    const db = getDatabase();

    // ============ Model Operations ============

    const getModelsFromDb = (filters?: FilterOptions): ModelWithTags[] => {
        let query = `
      SELECT m.*, GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) as tags_data
      FROM models m
      LEFT JOIN model_tags mt ON m.id = mt.model_id
      LEFT JOIN tags t ON mt.tag_id = t.id
    `;

        const conditions: string[] = [];
        const params: any[] = [];

        if (filters?.collectionId) {
            conditions.push('m.collection_id = ?');
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

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY m.id';

        // Add sorting
        const sortBy = filters?.sortBy || 'created_at';
        const sortOrder = filters?.sortOrder || 'desc';
        query += ` ORDER BY m.${sortBy} ${sortOrder.toUpperCase()}`;

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

            return {
                id: row.id,
                filename: row.filename,
                filepath: row.filepath,
                displayName: row.display_name,
                fileSize: row.file_size,
                fileType: row.file_type,
                collectionId: row.collection_id,
                createdAt: row.created_at,
                modifiedAt: row.modified_at,
                thumbnailPath: row.thumbnail_path,
                tags
            };
        });
    };

    ipcMain.handle('get-models', async (_event, filters?: FilterOptions): Promise<ModelWithTags[]> => {
        return getModelsFromDb(filters);
    });

    ipcMain.handle('search-models', async (_event, query: string): Promise<ModelWithTags[]> => {
        // Get all models first
        // Optimization: In a real app with 10k+ models, we might want to keep the Fuse index in memory
        // rather than rebuilding it on every search. For now, this is simpler and fast enough for < 1000 items.
        const allModels = getModelsFromDb();

        if (!query || query.trim() === '') {
            return allModels;
        }

        const Fuse = (await import('fuse.js')).default;
        const fuse = new Fuse(allModels, {
            keys: ['filename', 'displayName', 'tags.name'],
            threshold: 0.4, // Match sensitivity (0.0 = exact, 1.0 = anything)
            distance: 100,
            includeScore: true
        });

        const results = fuse.search(query);
        return results.map(result => result.item);
    });

    ipcMain.handle('import-files', async (event): Promise<Model[]> => {
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
                    console.log(`Thumbnail generated for ${filename}`);
                }).catch(err => {
                    console.error(`Failed to generate thumbnail for ${filename}:`, err);
                });
            }
        }

        return imported;
    });

    ipcMain.handle('delete-file', async (_event, id: number): Promise<void> => {
        // Use the duplicate finder's delete function which handles cleanup
        await deleteModel(id);
    });

    // ============ Tag Operations ============

    ipcMain.handle('get-tags', async (): Promise<Tag[]> => {
        const rows = db.prepare('SELECT * FROM tags ORDER BY name').all();
        return rows as Tag[];
    });

    ipcMain.handle('create-tag', async (_event, name: string, color: string): Promise<Tag> => {
        const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color);
        return {
            id: result.lastInsertRowid as number,
            name,
            color
        };
    });

    ipcMain.handle('add-tag-to-model', async (_event, modelId: number, tagId: number): Promise<void> => {
        db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)').run(modelId, tagId);
    });

    ipcMain.handle('remove-tag-from-model', async (_event, modelId: number, tagId: number): Promise<void> => {
        db.prepare('DELETE FROM model_tags WHERE model_id = ? AND tag_id = ?').run(modelId, tagId);
    });

    // ============ Collection Operations ============

    ipcMain.handle('get-collections', async (): Promise<Collection[]> => {
        const rows = db.prepare('SELECT * FROM collections WHERE is_active = 1 ORDER BY name').all();
        return rows.map(row => ({
            id: (row as any).id,
            name: (row as any).name,
            type: (row as any).type,
            folderPath: (row as any).folder_path,
            isActive: (row as any).is_active === 1
        }));
    });

    ipcMain.handle('create-collection', async (_event, name: string): Promise<Collection> => {
        const result = db.prepare('INSERT INTO collections (name, type) VALUES (?, ?)').run(name, 'collection');
        return {
            id: result.lastInsertRowid as number,
            name,
            type: 'collection',
            isActive: true
        };
    });

    ipcMain.handle('add-watched-folder', async (event, folderPath?: string): Promise<Collection> => {
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

    ipcMain.handle('remove-watched-folder', async (_event, id: number): Promise<void> => {
        // Stop watching the folder
        await stopWatchingFolder(id);

        // Mark as inactive in database
        db.prepare('UPDATE collections SET is_active = 0 WHERE id = ?').run(id);
    });

    // ============ Slicer Operations ============

    ipcMain.handle('get-slicers', async () => {
        // TODO: Implement slicer detection
        return [];
    });

    ipcMain.handle('open-in-slicer', async (_event, modelPath: string, slicerId: string) => {
        // TODO: Implement open in slicer
        console.log('Open in slicer:', modelPath, slicerId);
    });

    // ============ Utility Operations ============

    ipcMain.handle('open-folder', async (_event, folderPath: string): Promise<void> => {
        await shell.openPath(folderPath);
    });

    ipcMain.handle('find-duplicates', async () => {
        return await findDuplicates();
    });

    ipcMain.handle('calculate-wasted-space', async () => {
        return await calculateWastedSpace();
    });
};
