import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import fs from 'fs';
import path from 'path';
import { getDatabase } from './database';
import {
    applySuggestedTags,
    deleteModel,
    fileTypeOf,
    findDuplicates,
    findSimilar,
    getEmbeddingStats,
    listAiCategories,
    listTagNames,
    forgetMissingModels,
    getLibraryStats,
    getModel,
    getModelReadme,
    getModelsPage,
    importModel,
    notifyModelsUpdated,
    rebuildSearchIndex,
    refreshSearchIndex,
    removeModelsOfWatchedFolder,
    renameModelFile,
    updateSourceMetadata,
} from './library';
import { isFolderWatched, startWatchingFolder, stopWatchingFolder, syncFolder } from './fileWatcher';
import { dequeueModel, enqueueAll, enqueueModel, getProgress } from './indexer';
import { cancelThumbnailRender, requestThumbnailRender, saveThumbnailFromBase64 } from './thumbnails';
import { addCustomSlicer, listSlicers, openInSlicer, removeCustomSlicer, setDefaultSlicer } from './slicers';
import { importZipFiles } from './zipImport';
import { getSetting, setSetting } from './settings';
import { buildEmbeddings, cancelEmbeddingBuild } from './ai/embeddings';
import { APP_VERSION, checkForUpdates, downloadUpdate, getUpdateStatus, installUpdate, isAutoCheckEnabled, setAutoCheckEnabled } from './updater';
import { chatJson, getAiConfig, getAiSettings, testConnection, updateAiSettings } from './ai/provider';
import { buildTranslationMessages, parseTranslation } from './ai/prompts';
import { cancelEnrichment, enqueueEnrichment, getEnrichmentProgress } from './ai/enrichment';
import type { AiSettingsUpdate, BedSize, Collection, EnrichmentTarget, FilterOptions, Model, QueryTranslation, SourceMetadata, Tag, ZipImportRequest } from '../src/types';

type Handler<T> = (event: IpcMainInvokeEvent, ...args: any[]) => Promise<T> | T;

function handle<T>(channel: string, handler: Handler<T>): void {
    ipcMain.handle(channel, async (event, ...args) => {
        try {
            return await handler(event, ...args);
        } catch (error) {
            console.error(`[IPC] ${channel}:`, error);
            throw error;
        }
    });
}

function windowFor(event: IpcMainInvokeEvent): BrowserWindow | undefined {
    return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

export function setupIpcHandlers(): void {
    const db = getDatabase();

    // ============ Files ============

    handle<ArrayBuffer>('read-file-as-buffer', async (_event, filepath: string) => {
        // Only files that are part of the library may be read by the renderer.
        const known = db.prepare('SELECT 1 FROM models WHERE filepath = ?').get(filepath);
        if (!known) throw new Error('File is not part of the library');
        const buffer = await fs.promises.readFile(filepath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    });

    // ============ Models ============

    handle('get-models', (_event, filters?: FilterOptions) => getModelsPage(filters));

    handle('get-model-readme', (_event, id: number) => getModelReadme(id));

    handle('import-files', async (event): Promise<Model[]> => {
        const result = await dialog.showOpenDialog(windowFor(event)!, {
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: '3D Models', extensions: ['stl', '3mf', 'obj', 'glb', 'gltf', 'usdz', 'step', 'stp'] },
                { name: 'STL Files', extensions: ['stl'] },
                { name: '3MF Files', extensions: ['3mf'] },
                { name: 'OBJ Files', extensions: ['obj'] },
                { name: 'glTF Files', extensions: ['glb', 'gltf'] },
                { name: 'USDZ Files', extensions: ['usdz'] },
                { name: 'STEP Files', extensions: ['step', 'stp'] },
            ],
        });
        if (result.canceled) return [];

        const imported: Model[] = [];
        for (const filepath of result.filePaths) {
            const outcome = importModel(filepath, null);
            if (!outcome) continue;
            enqueueModel(outcome.id);
            const model = getModel(outcome.id);
            if (model && outcome.created) imported.push(model);
        }
        if (imported.length > 0) notifyModelsUpdated();
        return imported;
    });

    handle('import-file-paths', (_event, paths: string[]): number => {
        let imported = 0;
        for (const filePath of paths) {
            if (!fileTypeOf(filePath) || !fs.existsSync(filePath)) continue;
            const outcome = importModel(path.resolve(filePath), null);
            if (!outcome) continue;
            enqueueModel(outcome.id);
            if (outcome.created || outcome.restored) imported++;
        }
        if (imported > 0) notifyModelsUpdated();
        return imported;
    });

    handle('pick-zip-files', async (event): Promise<string[]> => {
        const result = await dialog.showOpenDialog(windowFor(event)!, {
            title: 'Choose ZIP archives to import',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'ZIP archives', extensions: ['zip'] }],
        });
        return result.canceled ? [] : result.filePaths;
    });

    handle('import-zip', (_event, request: ZipImportRequest) => importZipFiles(request.zipPaths, request.collectionId));

    handle('delete-file', (_event, id: number) => {
        dequeueModel(id);
        cancelThumbnailRender(id);
        deleteModel(id);
        notifyModelsUpdated();
    });

    handle('rename-model-file', async (_event, id: number, newName: string) => {
        await renameModelFile(id, newName);
        notifyModelsUpdated();
    });

    handle('update-model-metadata', (_event, id: number, metadata: SourceMetadata) => {
        updateSourceMetadata(id, metadata);
        notifyModelsUpdated();
    });

    // ============ Tags ============

    handle('get-tags', () => db.prepare('SELECT * FROM tags ORDER BY name').all() as Tag[]);

    handle('create-tag', (_event, name: string, color: string): Tag => {
        const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name.trim(), color);
        return { id: result.lastInsertRowid as number, name: name.trim(), color };
    });

    handle('add-tag-to-model', (_event, modelId: number, tagId: number) => {
        db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)').run(modelId, tagId);
        refreshSearchIndex(modelId);
    });

    handle('remove-tag-from-model', (_event, modelId: number, tagId: number) => {
        db.prepare('DELETE FROM model_tags WHERE model_id = ? AND tag_id = ?').run(modelId, tagId);
        refreshSearchIndex(modelId);
    });

    // ============ Collections ============

    handle('get-collections', (): Collection[] => {
        const rows = db.prepare('SELECT * FROM collections WHERE is_active = 1 ORDER BY name').all() as Array<{
            id: number; name: string; type: 'collection' | 'watched'; folder_path: string | null; is_active: number;
        }>;
        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            type: row.type,
            folderPath: row.folder_path ?? undefined,
            isActive: row.is_active === 1,
            isOnline: row.type === 'watched' ? isFolderWatched(row.id) && fs.existsSync(row.folder_path ?? '') : undefined,
        }));
    });

    handle('create-collection', (_event, name: string): Collection => {
        const result = db.prepare("INSERT INTO collections (name, type) VALUES (?, 'collection')").run(name.trim());
        return { id: result.lastInsertRowid as number, name: name.trim(), type: 'collection', isActive: true };
    });

    handle('rename-collection', (_event, id: number, newName: string) => {
        db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(newName.trim(), id);
    });

    handle('delete-collection', (_event, id: number) => {
        db.prepare("DELETE FROM collections WHERE id = ? AND type = 'collection'").run(id);
    });

    handle('add-model-to-collection', (_event, modelId: number, collectionId: number) => {
        db.prepare('INSERT OR IGNORE INTO model_collections (model_id, collection_id) VALUES (?, ?)').run(modelId, collectionId);
    });

    handle('remove-model-from-collection', (_event, modelId: number, collectionId: number) => {
        db.prepare('DELETE FROM model_collections WHERE model_id = ? AND collection_id = ?').run(modelId, collectionId);
    });

    // ============ Watched folders ============

    handle('add-watched-folder', async (event, folderPath?: string): Promise<Collection> => {
        if (!folderPath) {
            const result = await dialog.showOpenDialog(windowFor(event)!, { properties: ['openDirectory'] });
            if (result.canceled || result.filePaths.length === 0) throw new Error('No folder selected');
            folderPath = result.filePaths[0];
        }
        folderPath = path.resolve(folderPath);

        // Re-activate a previously removed folder instead of creating a duplicate row.
        const existing = db.prepare("SELECT id, is_active FROM collections WHERE type = 'watched' AND folder_path = ?").get(folderPath) as
            | { id: number; is_active: number }
            | undefined;

        let collectionId: number;
        if (existing) {
            if (existing.is_active === 1) throw new Error('This folder is already being watched');
            db.prepare('UPDATE collections SET is_active = 1 WHERE id = ?').run(existing.id);
            collectionId = existing.id;
        } else {
            const insert = db.prepare("INSERT INTO collections (name, type, folder_path) VALUES (?, 'watched', ?)").run(path.basename(folderPath), folderPath);
            collectionId = insert.lastInsertRowid as number;
        }

        startWatchingFolder(collectionId, folderPath);
        void syncFolder(collectionId, folderPath);

        return { id: collectionId, name: path.basename(folderPath), type: 'watched', folderPath, isActive: true };
    });

    handle('remove-watched-folder', async (_event, id: number) => {
        await stopWatchingFolder(id);
        const removed = removeModelsOfWatchedFolder(id);
        db.prepare('UPDATE collections SET is_active = 0 WHERE id = ?').run(id);
        console.log(`[IPC] Stopped watching folder ${id}; removed ${removed} models from the library`);
        notifyModelsUpdated();
    });

    handle('refresh-watched-folders', async () => {
        const collections = db.prepare("SELECT id, folder_path FROM collections WHERE type = 'watched' AND is_active = 1").all() as Array<{ id: number; folder_path: string }>;
        for (const collection of collections) {
            await stopWatchingFolder(collection.id);
            if (fs.existsSync(collection.folder_path)) startWatchingFolder(collection.id, collection.folder_path);
            await syncFolder(collection.id, collection.folder_path);
        }
    });

    // ============ Thumbnails & indexing ============

    handle('capture-thumbnail', async (_event, modelId: number, imageData: string) => {
        cancelThumbnailRender(modelId);
        await saveThumbnailFromBase64(modelId, imageData, 'capture');
        notifyModelsUpdated();
    });

    handle('get-index-progress', () => getProgress());

    handle('get-library-stats', () => getLibraryStats());

    handle('forget-missing-models', () => {
        const removed = forgetMissingModels();
        if (removed > 0) notifyModelsUpdated();
        return removed;
    });

    handle('rebuild-index', (_event, options?: { regenerateThumbnails?: boolean }) => {
        rebuildSearchIndex();
        enqueueAll(true);
        if (options?.regenerateThumbnails) {
            const rows = db.prepare("SELECT id, filepath, file_type FROM models WHERE thumbnail_source IS NULL OR thumbnail_source IN ('render', 'folder')").all() as Array<{
                id: number; filepath: string; file_type: Model['fileType'];
            }>;
            for (const row of rows) requestThumbnailRender(row.id, row.filepath, row.file_type, true);
        }
    });

    // ============ Duplicates ============

    handle('find-duplicates', () => findDuplicates());
    handle('find-similar', (_event, modelId: number, limit?: number) => findSimilar(modelId, limit ?? 12));
    handle('ai:embedding-stats', () => getEmbeddingStats());
    handle('ai:build-embeddings', () => buildEmbeddings());
    handle('ai:cancel-embeddings', () => cancelEmbeddingBuild());

    // ============ Printer bed ============

    handle('get-bed-size', () => getSetting<BedSize | null>('printer.bed', null));
    handle('set-bed-size', (_event, bed: BedSize | null): BedSize | null => {
        if (bed && [bed.x, bed.y, bed.z].every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) {
            const clean = { x: bed.x, y: bed.y, z: bed.z };
            setSetting('printer.bed', clean);
            return clean;
        }
        setSetting('printer.bed', null);
        return null;
    });

    // ============ Slicers & shell ============

    handle('get-slicers', (_event, rescan?: boolean) => listSlicers(Boolean(rescan)));

    handle('set-default-slicer', (_event, id: string | null) => setDefaultSlicer(id));

    handle('add-custom-slicer', (event) => addCustomSlicer(windowFor(event)));

    handle('remove-custom-slicer', (_event, id: string) => removeCustomSlicer(id));

    handle('open-in-slicer', async (_event, modelPath: string, slicerId?: string) => {
        const known = db.prepare('SELECT 1 FROM models WHERE filepath = ? AND missing_since IS NULL').get(modelPath);
        if (!known) throw new Error('File is not part of the library or is missing');
        await openInSlicer(modelPath, slicerId);
    });

    handle('open-folder', (_event, filePath: string) => {
        shell.showItemInFolder(filePath);
    });

    handle('get-app-version', () => APP_VERSION);

    handle('open-external', async (_event, url: string) => {
        if (!/^https:\/\//i.test(url)) throw new Error('Only https links can be opened');
        await shell.openExternal(url);
    });

    // ============ AI assistant ============

    handle('ai:get-settings', () => getAiSettings());
    handle('ai:update-settings', (_event, update: AiSettingsUpdate) => updateAiSettings(update ?? {}));
    handle('ai:test-connection', (_event, update?: AiSettingsUpdate) => testConnection(update));
    handle('ai:get-progress', () => getEnrichmentProgress());
    handle('ai:cancel', () => cancelEnrichment());
    handle('ai:apply-suggested-tags', (_event, modelId: number) => {
        const added = applySuggestedTags(modelId);
        if (added > 0) notifyModelsUpdated();
        return added;
    });

    handle('ai:enrich', (_event, target: EnrichmentTarget) => {
        if (!getAiConfig().enabled) throw new Error('The AI assistant is turned off in Settings.');
        return enqueueEnrichment(target);
    });

    handle('ai:translate-search', async (_event, text: string): Promise<QueryTranslation> => {
        const input = (text ?? '').trim();
        if (!input) throw new Error('Type what you are looking for first.');
        const messages = buildTranslationMessages(input, {
            tags: listTagNames(),
            categories: listAiCategories(),
            today: new Date().toISOString().slice(0, 10),
        });
        const raw = await chatJson(messages, { maxTokens: 400, temperature: 0.1 });
        return parseTranslation(raw, input, getAiConfig().model);
    });

    // ============ Updates ============

    handle('updates:get-status', () => getUpdateStatus());
    handle('updates:check', () => checkForUpdates());
    handle('updates:download', () => downloadUpdate());
    handle('updates:install', () => installUpdate());
    handle('updates:get-auto-check', () => isAutoCheckEnabled());
    handle('updates:set-auto-check', (_event, enabled: boolean) => setAutoCheckEnabled(Boolean(enabled)));
}
