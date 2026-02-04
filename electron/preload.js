const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded successfully');

const electronAPI = {
    // Model operations
    getModels: (filters) => ipcRenderer.invoke('get-models', filters),
    searchModels: (query) => ipcRenderer.invoke('search-models', query),
    importFiles: () => ipcRenderer.invoke('import-files'),
    deleteFile: (id) => ipcRenderer.invoke('delete-file', id),

    // Tag operations
    getTags: () => ipcRenderer.invoke('get-tags'),
    createTag: (name, color) => ipcRenderer.invoke('create-tag', name, color),
    addTagToModel: (modelId, tagId) => ipcRenderer.invoke('add-tag-to-model', modelId, tagId),
    removeTagFromModel: (modelId, tagId) => ipcRenderer.invoke('remove-tag-from-model', modelId, tagId),

    // Collection operations
    getCollections: () => ipcRenderer.invoke('get-collections'),
    createCollection: (name) => ipcRenderer.invoke('create-collection', name),
    addWatchedFolder: (path) => ipcRenderer.invoke('add-watched-folder', path),
    removeWatchedFolder: (id) => ipcRenderer.invoke('remove-watched-folder', id),

    // Slicer operations
    getSlicers: () => ipcRenderer.invoke('get-slicers'),
    openInSlicer: (modelPath, slicerId) => ipcRenderer.invoke('open-in-slicer', modelPath, slicerId),

    // Utility operations
    openFolder: (path) => ipcRenderer.invoke('open-folder', path),
    findDuplicates: () => ipcRenderer.invoke('find-duplicates'),
    calculateWastedSpace: () => ipcRenderer.invoke('calculate-wasted-space'),

    // Events
    onModelsUpdated: (callback) => {
        ipcRenderer.on('models-updated', callback);
    }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
