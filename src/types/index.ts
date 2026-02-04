export interface Model {
    id: number;
    filename: string;
    filepath: string;
    displayName?: string;
    fileSize: number;
    collectionId?: number;
    createdAt: string;
    modifiedAt?: string;
    thumbnailPath?: string;
    fileType: 'stl' | '3mf' | 'obj';
    tags?: Tag[];
    sourceMetadata?: {
        source?: string;
        url?: string;
        author?: string;
        license?: string;
        notes?: string;
    };
}

export interface Tag {
    id: number;
    name: string;
    color: string;
}

export interface Collection {
    id: number;
    name: string;
    type: 'collection' | 'watched';
    folderPath?: string;
    isActive: boolean;
}

export interface ModelWithTags extends Model {
    tags: Tag[];
}

export interface FilterOptions {
    collectionId?: number;
    tagIds?: number[];
    searchQuery?: string;
    fileType?: 'stl' | '3mf' | 'obj';
    sortBy?: 'name' | 'created' | 'modified' | 'size';
    sortOrder?: 'asc' | 'desc';
}

export interface Slicer {
    id: string;
    name: string;
    path: string;
    detected: boolean;
}

export interface DuplicateGroup {
    hash: string;
    models: Model[];
    totalSize: number;
}

// Electron IPC API
export interface ElectronAPI {
    // Model operations
    getModels: (filters?: FilterOptions) => Promise<ModelWithTags[]>;
    searchModels: (query: string) => Promise<ModelWithTags[]>;
    importFiles: () => Promise<Model[]>;
    deleteFile: (id: number) => Promise<void>;

    // Tag operations
    getTags: () => Promise<Tag[]>;
    createTag: (name: string, color: string) => Promise<Tag>;
    addTagToModel: (modelId: number, tagId: number) => Promise<void>;
    removeTagFromModel: (modelId: number, tagId: number) => Promise<void>;

    // Collection operations
    getCollections: () => Promise<Collection[]>;
    createCollection: (name: string) => Promise<Collection>;
    addWatchedFolder: (path: string) => Promise<Collection>;
    removeWatchedFolder: (id: number) => Promise<void>;

    // Slicer operations
    getSlicers: () => Promise<Slicer[]>;
    openInSlicer: (modelPath: string, slicerId: string) => Promise<void>;

    // Utility operations
    openFolder: (path: string) => Promise<void>;
    findDuplicates: () => Promise<DuplicateGroup[]>;
    calculateWastedSpace: () => Promise<{ totalWasted: number; groupCount: number }>;
    updateModelMetadata: (modelId: number, metadata: Record<string, any>) => Promise<void>;

    // Events
    onModelsUpdated: (callback: () => void) => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
