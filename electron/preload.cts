import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../src/types';

console.log('Preload script loaded successfully');

const electronAPI: ElectronAPI = {
    // Model operations
    getModels: (filters) => ipcRenderer.invoke('get-models', filters),
    searchModels: (query) => ipcRenderer.invoke('search-models', query),
    importFiles: () => ipcRenderer.invoke('import-files'),
    deleteFile: (id) => ipcRenderer.invoke('delete-file', id),
    addModelToCollection: (modelId, collectionId) => ipcRenderer.invoke('add-model-to-collection', modelId, collectionId),
    removeModelFromCollection: (modelId, collectionId) => ipcRenderer.invoke('remove-model-from-collection', modelId, collectionId),

    // Tag operations
    getTags: () => ipcRenderer.invoke('get-tags'),
    createTag: (name, color) => ipcRenderer.invoke('create-tag', name, color),
    addTagToModel: (modelId, tagId) => ipcRenderer.invoke('add-tag-to-model', modelId, tagId),
    removeTagFromModel: (modelId, tagId) => ipcRenderer.invoke('remove-tag-from-model', modelId, tagId),

    // Collection operations
    getCollections: () => ipcRenderer.invoke('get-collections'),
    createCollection: (name) => ipcRenderer.invoke('create-collection', name),
    renameCollection: (id, newName) => ipcRenderer.invoke('rename-collection', id, newName),
    deleteCollection: (id) => ipcRenderer.invoke('delete-collection', id),
    addWatchedFolder: (path) => ipcRenderer.invoke('add-watched-folder', path),
    removeWatchedFolder: (id) => ipcRenderer.invoke('remove-watched-folder', id),

    // Slicer operations
    getSlicers: () => ipcRenderer.invoke('get-slicers'),
    openInSlicer: (modelPath, slicerId) => ipcRenderer.invoke('open-in-slicer', modelPath, slicerId),

    // Utility operations
    openFolder: (path) => ipcRenderer.invoke('open-folder', path),
    findDuplicates: () => ipcRenderer.invoke('find-duplicates'),
    calculateWastedSpace: () => ipcRenderer.invoke('calculate-wasted-space'),
    updateModelMetadata: (modelId, metadata) => ipcRenderer.invoke('update-model-metadata', modelId, metadata),
    readFileAsBuffer: (filepath) => ipcRenderer.invoke('read-file-as-buffer', filepath),
    captureThumbnail: (modelId, imageData) => ipcRenderer.invoke('capture-thumbnail', modelId, imageData),
    refreshWatchedFolders: () => ipcRenderer.invoke('refresh-watched-folders'),

    // Events
    onModelsUpdated: (callback) => {
        ipcRenderer.on('models-updated', callback);
    }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
