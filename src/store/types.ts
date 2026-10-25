import type { StateCreator } from 'zustand';
import type {
    AiProgress,
    AiSettings,
    AiSettingsUpdate,
    BedSize,
    Collection,
    DuplicateGroup,
    EnrichmentTarget,
    IndexProgress,
    LibraryStats,
    ModelWithTags,
    NearDuplicateGroup,
    QueryTranslation,
    Slicer,
    SortBy,
    SortOrder,
    Tag,
    UpdateStatus,
} from '../types';

export type Theme = 'dark' | 'light' | 'system';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export interface Toast {
    id: number;
    kind: ToastKind;
    title: string;
    message?: string;
}
export interface ToastInput {
    kind: ToastKind;
    title: string;
    message?: string;
    /** Milliseconds before auto-dismiss; errors and warnings stay longer. 0 keeps it until dismissed. */
    timeout?: number;
}

export interface NotificationsSlice {
    toasts: Toast[];
    pushToast: (toast: ToastInput) => number;
    dismissToast: (id: number) => void;
    /** Shows an error toast built from any thrown value. */
    reportError: (title: string, error: unknown) => void;
}

export interface UiSlice {
    theme: Theme;
    viewMode: 'grid' | 'list';
    selectedModel: ModelWithTags | null;
    isViewerOpen: boolean;
    isSettingsOpen: boolean;
    importZipDialog: { open: boolean; zipPaths: string[] };
    indexProgress: IndexProgress | null;
    updateStatus: UpdateStatus | null;
    /** Version the user dismissed the update banner for. */
    dismissedUpdateVersion: string | null;

    setTheme: (theme: Theme) => void;
    setViewMode: (mode: 'grid' | 'list') => void;
    openViewer: (model: ModelWithTags) => void;
    closeViewer: () => void;
    openSettings: () => void;
    closeSettings: () => void;
    setIndexProgress: (progress: IndexProgress | null) => void;
    openImportZip: (zipPaths?: string[]) => void;
    closeImportZip: () => void;
    setUpdateStatus: (status: UpdateStatus | null) => void;
    dismissUpdateBanner: () => void;
    checkForUpdates: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    installUpdate: () => Promise<void>;
}

export interface LibrarySlice {
    /** Models loaded so far for the current filters (paged). */
    models: ModelWithTags[];
    /** Total matches for the current filters, which may exceed models.length. */
    totalModels: number;
    isLoading: boolean;
    isLoadingMore: boolean;
    libraryStats: LibraryStats | null;
    tags: Tag[];
    collections: Collection[];

    selectedCollection: number | null;
    selectedTags: number[];
    searchQuery: string;
    sortBy: SortBy;
    sortOrder: SortOrder;

    setCollections: (collections: Collection[]) => void;
    setSelectedCollection: (id: number | null) => void;
    toggleTag: (tagId: number) => void;
    setSearchQuery: (query: string) => void;
    setSortBy: (sortBy: SortBy) => void;
    setSortOrder: (order: SortOrder) => void;

    /** Reloads the listing. `reset` starts again from the first page; otherwise the loaded window is refreshed in place. */
    loadModels: (options?: { reset?: boolean }) => Promise<void>;
    loadMoreModels: () => Promise<void>;
    loadTags: () => Promise<void>;
    loadCollections: () => Promise<void>;
    importFiles: () => Promise<void>;
    createTag: (name: string, color: string) => Promise<void>;
    addTagToModel: (modelId: number, tagId: number) => Promise<void>;
    removeTagFromModel: (modelId: number, tagId: number) => Promise<void>;
}

export interface DuplicatesSlice {
    isDuplicatesModalOpen: boolean;
    duplicateGroups: DuplicateGroup[];
    nearDuplicateGroups: NearDuplicateGroup[];
    wastedSpace: { totalWasted: number; groupCount: number; unhashedCount: number } | null;
    openDuplicatesModal: () => void;
    closeDuplicatesModal: () => void;
    checkForDuplicates: () => Promise<void>;
    deleteDuplicate: (modelId: number) => Promise<void>;
}

export interface SelectionSlice {
    selectedModels: Set<number>;
    /** True while the user is in selection mode (checkboxes shown, clicks toggle instead of opening). */
    selectionMode: boolean;
    /** Index (in `models`) of the last explicitly toggled card; shift-click ranges start here. */
    selectionAnchor: number | null;

    setSelectionMode: (on: boolean) => void;
    toggleModelSelection: (id: number, index?: number) => void;
    selectRangeTo: (index: number) => void;
    selectAllModels: () => void;
    clearSelection: () => void;
    bulkDelete: () => Promise<void>;
    bulkAddTag: (tagId: number) => Promise<void>;
    bulkRemoveTag: (tagId: number) => Promise<void>;
    bulkAddToCollection: (collectionId: number) => Promise<void>;
}

export interface AssistantSlice {
    aiSettings: AiSettings | null;
    aiProgress: AiProgress | null;
    bedSize: BedSize | null;
    /** Result of the last natural-language search, shown under the search box. */
    lastTranslation: QueryTranslation | null;
    isTranslating: boolean;

    loadAiSettings: () => Promise<void>;
    updateAiSettings: (update: AiSettingsUpdate) => Promise<void>;
    loadBedSize: () => Promise<void>;
    updateBedSize: (bed: BedSize | null) => Promise<void>;
    setAiProgress: (progress: AiProgress | null) => void;
    /** Turns a plain-language request into a search and applies it. */
    askSearch: (text: string) => Promise<void>;
    clearTranslation: () => void;
    enrichModels: (target: EnrichmentTarget) => Promise<void>;
    cancelEnrichment: () => Promise<void>;
    applySuggestedTags: (modelId: number) => Promise<void>;
}

export interface SlicersSlice {
    slicers: Slicer[];
    loadSlicers: (rescan?: boolean) => Promise<void>;
    setDefaultSlicer: (id: string | null) => Promise<void>;
    addCustomSlicer: () => Promise<void>;
    removeCustomSlicer: (id: string) => Promise<void>;
    /** Returns an error message on failure, null on success. */
    openInSlicer: (modelPath: string, slicerId?: string) => Promise<string | null>;
}

export type AppState = NotificationsSlice & UiSlice & LibrarySlice & DuplicatesSlice & SelectionSlice & AssistantSlice & SlicersSlice;

/** A slice of the store: it may read and update the whole state. */
export type Slice<T> = StateCreator<AppState, [], [], T>;

/**
 * Runs an IPC action and turns a failure into an error toast. Resolves to undefined on failure,
 * so callers can continue without their own try/catch.
 */
export async function attempt<T>(get: () => AppState, errorTitle: string, action: () => Promise<T>): Promise<T | undefined> {
    try {
        return await action();
    } catch (error) {
        get().reportError(errorTitle, error);
        return undefined;
    }
}
