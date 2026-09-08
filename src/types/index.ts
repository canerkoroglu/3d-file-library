export type FileType = 'stl' | '3mf' | 'obj';

export type ThumbnailSource = 'embedded' | 'sidecar' | 'render' | 'capture' | 'folder';

export interface SourceMetadata {
    source?: string;
    url?: string;
    author?: string;
    license?: string;
    notes?: string;
}

/** Metadata extracted from slicer project files (3MF) or model headers. */
export interface PrintMetadata {
    title?: string;
    designer?: string;
    description?: string;
    slicer?: string;
    printerModel?: string;
    filamentTypes?: string[];
    layerHeight?: number;
    license?: string;
}

export interface BoundingBox {
    x: number;
    y: number;
    z: number;
}

export interface Model {
    id: number;
    filename: string;
    filepath: string;
    folderPath: string;
    displayName?: string;
    fileSize: number;
    fileType: FileType;
    collectionIds: number[];
    createdAt: string;
    modifiedAt?: string;
    thumbnailPath?: string;
    thumbnailSource?: ThumbnailSource;
    thumbnailUpdatedAt?: string;
    contentHash?: string;
    triangleCount?: number;
    bbox?: BoundingBox;
    volumeMm3?: number;
    printMeta?: PrintMetadata;
    hasReadme: boolean;
    indexedAt?: string;
    /** Set while the file cannot be found on disk (deleted, or its drive is disconnected). */
    missingSince?: string;
    sourceMetadata?: SourceMetadata;
    tags?: Tag[];
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
    /** For watched folders: whether the folder currently exists on disk. */
    isOnline?: boolean;
}

export interface LibraryStats {
    models: number;
    missing: number;
}

export interface ModelWithTags extends Model {
    tags: Tag[];
}

export type SortBy = 'relevance' | 'name' | 'created' | 'modified' | 'size' | 'triangles';
export type SortOrder = 'asc' | 'desc';

export interface FilterOptions {
    collectionId?: number;
    tagIds?: number[];
    searchQuery?: string;
    fileType?: FileType;
    sortBy?: SortBy;
    sortOrder?: SortOrder;
    limit?: number;
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

export interface DuplicateReport {
    groups: DuplicateGroup[];
    totalWasted: number;
    groupCount: number;
    /** Files whose hash has not been computed yet, so they could not be compared. */
    unhashedCount: number;
}

export interface IndexProgress {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    total: number;
    thumbnailsQueued: number;
    isRunning: boolean;
}

export interface ThumbnailRenderRequest {
    jobId: number;
    modelId: number;
    filepath: string;
    fileType: FileType;
}

export interface ThumbnailRenderResult {
    jobId: number;
    ok: boolean;
    /** Base64 PNG (no data-URL prefix). */
    imageData?: string;
    error?: string;
}

// Electron IPC API exposed through the preload script
export interface ElectronAPI {
    // Model operations
    getModels: (filters?: FilterOptions) => Promise<ModelWithTags[]>;
    getModelReadme: (id: number) => Promise<string | null>;
    importFiles: () => Promise<Model[]>;
    deleteFile: (id: number) => Promise<void>;
    addModelToCollection: (modelId: number, collectionId: number) => Promise<void>;
    removeModelFromCollection: (modelId: number, collectionId: number) => Promise<void>;
    renameModelFile: (id: number, newName: string) => Promise<void>;

    // Tag operations
    getTags: () => Promise<Tag[]>;
    createTag: (name: string, color: string) => Promise<Tag>;
    addTagToModel: (modelId: number, tagId: number) => Promise<void>;
    removeTagFromModel: (modelId: number, tagId: number) => Promise<void>;

    // Collection operations
    getCollections: () => Promise<Collection[]>;
    createCollection: (name: string) => Promise<Collection>;
    renameCollection: (id: number, newName: string) => Promise<void>;
    deleteCollection: (id: number) => Promise<void>;
    addWatchedFolder: (path?: string) => Promise<Collection>;
    removeWatchedFolder: (id: number) => Promise<void>;
    refreshWatchedFolders: () => Promise<void>;

    // Slicer operations
    getSlicers: () => Promise<Slicer[]>;
    openInSlicer: (modelPath: string, slicerId: string) => Promise<void>;

    // Utility operations
    openFolder: (path: string) => Promise<void>;
    findDuplicates: () => Promise<DuplicateReport>;
    updateModelMetadata: (modelId: number, metadata: SourceMetadata) => Promise<void>;
    readFileAsBuffer: (filepath: string) => Promise<ArrayBuffer>;
    captureThumbnail: (modelId: number, imageData: string) => Promise<void>;

    // Indexer & library maintenance
    getIndexProgress: () => Promise<IndexProgress>;
    rebuildIndex: (options?: { regenerateThumbnails?: boolean }) => Promise<void>;
    getLibraryStats: () => Promise<LibraryStats>;
    /** Permanently removes library entries whose files are missing. Returns how many were removed. */
    forgetMissingModels: () => Promise<number>;

    // Thumbnail rendering (renderer acts as a render worker for the main process)
    onThumbnailRender: (callback: (request: ThumbnailRenderRequest) => void) => () => void;
    sendThumbnailResult: (result: ThumbnailRenderResult) => void;
    thumbnailRendererReady: () => void;

    // Events (each returns an unsubscribe function)
    onModelsUpdated: (callback: () => void) => () => void;
    onCollectionsUpdated: (callback: () => void) => () => void;
    onIndexProgress: (callback: (progress: IndexProgress) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
