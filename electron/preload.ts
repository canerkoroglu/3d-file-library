import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import type { AiProgress, AppNotice, ElectronAPI, IndexProgress, ThumbnailRenderRequest, UpdateStatus } from '../src/types';

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
    const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

const electronAPI: ElectronAPI = {
    // Models
    getModels: (filters) => ipcRenderer.invoke('get-models', filters),
    getModelReadme: (id) => ipcRenderer.invoke('get-model-readme', id),
    importFiles: () => ipcRenderer.invoke('import-files'),
    deleteFile: (id) => ipcRenderer.invoke('delete-file', id),
    addModelToCollection: (modelId, collectionId) => ipcRenderer.invoke('add-model-to-collection', modelId, collectionId),
    removeModelFromCollection: (modelId, collectionId) => ipcRenderer.invoke('remove-model-from-collection', modelId, collectionId),
    renameModelFile: (id, newName) => ipcRenderer.invoke('rename-model-file', id, newName),

    // Tags
    getTags: () => ipcRenderer.invoke('get-tags'),
    createTag: (name, color) => ipcRenderer.invoke('create-tag', name, color),
    addTagToModel: (modelId, tagId) => ipcRenderer.invoke('add-tag-to-model', modelId, tagId),
    removeTagFromModel: (modelId, tagId) => ipcRenderer.invoke('remove-tag-from-model', modelId, tagId),

    // Collections
    getCollections: () => ipcRenderer.invoke('get-collections'),
    createCollection: (name) => ipcRenderer.invoke('create-collection', name),
    renameCollection: (id, newName) => ipcRenderer.invoke('rename-collection', id, newName),
    deleteCollection: (id) => ipcRenderer.invoke('delete-collection', id),
    addWatchedFolder: (folderPath) => ipcRenderer.invoke('add-watched-folder', folderPath),
    removeWatchedFolder: (id) => ipcRenderer.invoke('remove-watched-folder', id),
    refreshWatchedFolders: () => ipcRenderer.invoke('refresh-watched-folders'),

    // Slicers
    getSlicers: (rescan) => ipcRenderer.invoke('get-slicers', rescan),
    setDefaultSlicer: (id) => ipcRenderer.invoke('set-default-slicer', id),
    addCustomSlicer: () => ipcRenderer.invoke('add-custom-slicer'),
    removeCustomSlicer: (id) => ipcRenderer.invoke('remove-custom-slicer', id),
    openInSlicer: (modelPath, slicerId) => ipcRenderer.invoke('open-in-slicer', modelPath, slicerId),

    // Importing
    pickZipFiles: () => ipcRenderer.invoke('pick-zip-files'),
    importZip: (request) => ipcRenderer.invoke('import-zip', request),
    importFilePaths: (paths) => ipcRenderer.invoke('import-file-paths', paths),
    getPathForFile: (file) => webUtils.getPathForFile(file),

    // Utilities
    openFolder: (filePath) => ipcRenderer.invoke('open-folder', filePath),
    findDuplicates: () => ipcRenderer.invoke('find-duplicates'),
    getBedSize: () => ipcRenderer.invoke('get-bed-size'),
    setBedSize: (bed) => ipcRenderer.invoke('set-bed-size', bed),
    updateModelMetadata: (modelId, metadata) => ipcRenderer.invoke('update-model-metadata', modelId, metadata),
    readFileAsBuffer: (filepath) => ipcRenderer.invoke('read-file-as-buffer', filepath),
    captureThumbnail: (modelId, imageData) => ipcRenderer.invoke('capture-thumbnail', modelId, imageData),

    // Indexer & library maintenance
    getIndexProgress: () => ipcRenderer.invoke('get-index-progress'),
    rebuildIndex: (options) => ipcRenderer.invoke('rebuild-index', options),
    getLibraryStats: () => ipcRenderer.invoke('get-library-stats'),
    forgetMissingModels: () => ipcRenderer.invoke('forget-missing-models'),

    // Thumbnail rendering
    onThumbnailRender: (callback) => subscribe<ThumbnailRenderRequest>('thumbnail:render', callback),
    sendThumbnailResult: (result) => ipcRenderer.send('thumbnail:rendered', result),
    thumbnailRendererReady: () => ipcRenderer.send('thumbnail:ready'),

    // Updates
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getUpdateStatus: () => ipcRenderer.invoke('updates:get-status'),
    checkForUpdates: () => ipcRenderer.invoke('updates:check'),
    downloadUpdate: () => ipcRenderer.invoke('updates:download'),
    installUpdate: () => ipcRenderer.invoke('updates:install'),
    getAutoCheckUpdates: () => ipcRenderer.invoke('updates:get-auto-check'),
    setAutoCheckUpdates: (enabled) => ipcRenderer.invoke('updates:set-auto-check', enabled),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // AI assistant
    getAiSettings: () => ipcRenderer.invoke('ai:get-settings'),
    updateAiSettings: (update) => ipcRenderer.invoke('ai:update-settings', update),
    testAiConnection: (update) => ipcRenderer.invoke('ai:test-connection', update),
    translateSearch: (text) => ipcRenderer.invoke('ai:translate-search', text),
    enrichModels: (target) => ipcRenderer.invoke('ai:enrich', target),
    cancelEnrichment: () => ipcRenderer.invoke('ai:cancel'),
    getAiProgress: () => ipcRenderer.invoke('ai:get-progress'),
    applySuggestedTags: (modelId) => ipcRenderer.invoke('ai:apply-suggested-tags', modelId),

    // Events
    onAiProgress: (callback) => subscribe<AiProgress>('ai:progress', callback),
    onUpdateStatus: (callback) => subscribe<UpdateStatus>('updates:status', callback),
    onAppNotice: (callback) => subscribe<AppNotice>('app:notice', callback),
    onModelsUpdated: (callback) => subscribe<void>('models-updated', () => callback()),
    onCollectionsUpdated: (callback) => subscribe<void>('collections-updated', () => callback()),
    onIndexProgress: (callback) => subscribe<IndexProgress>('index-progress', callback),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
