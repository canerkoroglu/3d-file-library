export type FileType = 'stl' | '3mf' | 'obj' | 'glb' | 'usdz' | 'step';

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

/** What the AI assistant produced for a model; stored as JSON and indexed for search. */
export interface AiEnrichment {
    /** Clean human-readable name, e.g. "Articulated dragon (body)". */
    name: string;
    /** One sentence describing the object and its use. */
    summary: string;
    /** One of AI_CATEGORIES. */
    category: string;
    /** Lowercase search words: synonyms, parts, purpose. */
    keywords: string[];
    /** Existing tag names the assistant thinks apply. */
    suggestedTags: string[];
    model: string;
    generatedAt: string;
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
    aiMetadata?: AiEnrichment;
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
    offset?: number;
}

/** One page of a listing plus the total number of matches for the same filters. */
export interface ModelPage {
    items: ModelWithTags[];
    total: number;
    offset: number;
}

export interface Slicer {
    /** Stable id: a known slicer key, `custom:<n>` for user-added entries, or `system` for the OS default handler. */
    id: string;
    name: string;
    /** App bundle, executable, binary or flatpak id. Empty for the system default. */
    path: string;
    detected: boolean;
    isCustom: boolean;
    isDefault: boolean;
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

export interface ZipImportRequest {
    zipPaths: string[];
    /** Watched folder the archives are extracted into. */
    collectionId: number;
}

export interface ZipImportResult {
    zipPath: string;
    /** Folder the archive was extracted into. */
    folder: string;
    extracted: number;
    models: number;
    skipped: number;
    error?: string;
}

// ============ AI assistant ============

export interface AiSettings {
    enabled: boolean;
    /** OpenAI-compatible base URL including the version path, e.g. http://localhost:11434/v1 */
    baseUrl: string;
    /** Model name as the server knows it, e.g. qwen3:8b */
    model: string;
    /** The key itself never leaves the main process. */
    hasApiKey: boolean;
    /** Analyse newly imported models without being asked. */
    autoEnrich: boolean;
    timeoutMs: number;
}

/** Partial update; `apiKey: null` clears the key, a string replaces it, undefined keeps it. */
export interface AiSettingsUpdate {
    enabled?: boolean;
    baseUrl?: string;
    model?: string;
    apiKey?: string | null;
    autoEnrich?: boolean;
    timeoutMs?: number;
}

export interface AiConnectionResult {
    ok: boolean;
    baseUrl: string;
    latencyMs?: number;
    /** Models the server reports, when it supports listing them. */
    models: string[];
    /** Whether the configured model is among them (undefined when the list is unavailable). */
    modelAvailable?: boolean;
    error?: string;
}

export interface AiProgress {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    total: number;
    isRunning: boolean;
    /** Filename currently being analysed. */
    current?: string;
    lastError?: string;
}

export interface QueryTranslation {
    input: string;
    /** Query in the app's search syntax. */
    query: string;
    explanation?: string;
    model: string;
}

export type EnrichmentTarget = { ids: number[] } | { scope: 'all' | 'missing' };

export type UpdateState = 'unsupported' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateStatus {
    state: UpdateState;
    currentVersion: string;
    /** Version offered by the update server, when known. */
    version?: string;
    releaseNotes?: string;
    releaseDate?: string;
    /** Link to the release page, for platforms that cannot install in place. */
    releaseUrl?: string;
    progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number };
    /** Explanation or error text for the user. */
    message?: string;
    checkedAt?: string;
    /** True when the platform cannot apply updates in place (unsigned macOS build). */
    manualInstall?: boolean;
}

/** A notification from the main process for the user (shown as a toast). */
export interface AppNotice {
    kind: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message?: string;
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
    getModels: (filters?: FilterOptions) => Promise<ModelPage>;
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
    getSlicers: (rescan?: boolean) => Promise<Slicer[]>;
    setDefaultSlicer: (id: string | null) => Promise<void>;
    /** Opens a file dialog to register a slicer the scan did not find. Resolves null when cancelled. */
    addCustomSlicer: () => Promise<Slicer | null>;
    removeCustomSlicer: (id: string) => Promise<void>;
    /** Opens the file in the given slicer, or the default one when no id is passed. */
    openInSlicer: (modelPath: string, slicerId?: string) => Promise<void>;

    // Importing
    pickZipFiles: () => Promise<string[]>;
    importZip: (request: ZipImportRequest) => Promise<ZipImportResult[]>;
    /** Registers loose model files (e.g. dropped on the window) in place. Returns how many were new. */
    importFilePaths: (paths: string[]) => Promise<number>;
    /** Resolves the filesystem path of a File from a drag-and-drop event. */
    getPathForFile: (file: File) => string;

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

    // Updates
    getAppVersion: () => Promise<string>;
    getUpdateStatus: () => Promise<UpdateStatus>;
    checkForUpdates: () => Promise<UpdateStatus>;
    downloadUpdate: () => Promise<void>;
    installUpdate: () => Promise<void>;
    getAutoCheckUpdates: () => Promise<boolean>;
    setAutoCheckUpdates: (enabled: boolean) => Promise<void>;
    openExternal: (url: string) => Promise<void>;

    // AI assistant
    getAiSettings: () => Promise<AiSettings>;
    updateAiSettings: (update: AiSettingsUpdate) => Promise<AiSettings>;
    /** Tests the saved settings, or the given unsaved values. */
    testAiConnection: (update?: AiSettingsUpdate) => Promise<AiConnectionResult>;
    translateSearch: (text: string) => Promise<QueryTranslation>;
    /** Queues models for analysis; resolves with how many were queued. */
    enrichModels: (target: EnrichmentTarget) => Promise<number>;
    cancelEnrichment: () => Promise<void>;
    getAiProgress: () => Promise<AiProgress>;
    /** Adds the assistant's suggested tags to the model; resolves with how many were added. */
    applySuggestedTags: (modelId: number) => Promise<number>;

    // Events (each returns an unsubscribe function)
    onAiProgress: (callback: (progress: AiProgress) => void) => () => void;
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
    onAppNotice: (callback: (notice: AppNotice) => void) => () => void;
    onModelsUpdated: (callback: () => void) => () => void;
    onCollectionsUpdated: (callback: () => void) => () => void;
    onIndexProgress: (callback: (progress: IndexProgress) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
