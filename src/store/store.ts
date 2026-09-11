import { create } from 'zustand';
import { describeError } from '../lib/errors';
import type {
    AiProgress,
    AiSettings,
    AiSettingsUpdate,
    Collection,
    DuplicateGroup,
    NearDuplicateGroup,
    BedSize,
    FilterOptions,
    IndexProgress,
    LibraryStats,
    ModelWithTags,
    Slicer,
    EnrichmentTarget,
    QueryTranslation,
    SortBy,
    SortOrder,
    Tag,
    UpdateStatus,
} from '../types';

type Theme = 'dark' | 'light' | 'system';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export interface Toast {
    id: number;
    kind: ToastKind;
    title: string;
    message?: string;
}
interface ToastInput {
    kind: ToastKind;
    title: string;
    message?: string;
    /** Milliseconds before auto-dismiss; errors and warnings stay longer. 0 keeps it until dismissed. */
    timeout?: number;
}
let nextToastId = 1;

const SEARCH_DEBOUNCE_MS = 200;
const PAGE_SIZE = 200;

function applyThemeToDom(theme: Theme): void {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.add(prefersDark ? 'dark' : 'light');
    } else {
        root.classList.add(theme);
    }
}

function readStoredTheme(): Theme {
    try {
        const stored = localStorage.getItem('theme');
        if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
    } catch {
        // storage unavailable
    }
    return 'system';
}

interface AppState {
    // Data
    /** Models loaded so far for the current filters (paged). */
    models: ModelWithTags[];
    /** Total matches for the current filters, which may exceed models.length. */
    totalModels: number;
    isLoadingMore: boolean;
    tags: Tag[];
    collections: Collection[];

    // Filters
    selectedCollection: number | null;
    selectedTags: number[];
    searchQuery: string;
    sortBy: SortBy;
    sortOrder: SortOrder;

    // UI state
    viewMode: 'grid' | 'list';
    selectedModel: ModelWithTags | null;
    isViewerOpen: boolean;
    isSettingsOpen: boolean;
    isDuplicatesModalOpen: boolean;
    duplicateGroups: DuplicateGroup[];
    nearDuplicateGroups: NearDuplicateGroup[];
    wastedSpace: { totalWasted: number; groupCount: number; unhashedCount: number } | null;
    selectedModels: Set<number>;
    /** True while the user is in selection mode (checkboxes shown, clicks toggle instead of opening). */
    selectionMode: boolean;
    /** Index (in `models`) of the last explicitly toggled card; shift-click ranges start here. */
    selectionAnchor: number | null;
    isLoading: boolean;
    indexProgress: IndexProgress | null;
    libraryStats: LibraryStats | null;
    slicers: Slicer[];
    importZipDialog: { open: boolean; zipPaths: string[] };
    updateStatus: UpdateStatus | null;
    /** Version the user dismissed the update banner for. */
    dismissedUpdateVersion: string | null;
    toasts: Toast[];
    aiSettings: AiSettings | null;
    bedSize: BedSize | null;
    aiProgress: AiProgress | null;
    /** Result of the last natural-language search, shown under the search box. */
    lastTranslation: QueryTranslation | null;
    isTranslating: boolean;
    theme: Theme;

    // AI assistant
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

    // Notifications
    pushToast: (toast: ToastInput) => number;
    dismissToast: (id: number) => void;
    /** Shows an error toast built from any thrown value. */
    reportError: (title: string, error: unknown) => void;

    // Actions
    setTheme: (theme: Theme) => void;
    setCollections: (collections: Collection[]) => void;
    setSelectedCollection: (id: number | null) => void;
    toggleTag: (tagId: number) => void;
    setSearchQuery: (query: string) => void;
    setSortBy: (sortBy: SortBy) => void;
    setSortOrder: (order: SortOrder) => void;
    setViewMode: (mode: 'grid' | 'list') => void;
    openViewer: (model: ModelWithTags) => void;
    closeViewer: () => void;
    openSettings: () => void;
    closeSettings: () => void;
    openDuplicatesModal: () => void;
    closeDuplicatesModal: () => void;
    setIndexProgress: (progress: IndexProgress | null) => void;
    openImportZip: (zipPaths?: string[]) => void;
    closeImportZip: () => void;
    setUpdateStatus: (status: UpdateStatus | null) => void;
    dismissUpdateBanner: () => void;
    checkForUpdates: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    installUpdate: () => Promise<void>;

    // Selection
    setSelectionMode: (on: boolean) => void;
    toggleModelSelection: (id: number, index?: number) => void;
    selectRangeTo: (index: number) => void;
    selectAllModels: () => void;
    clearSelection: () => void;
    bulkDelete: () => Promise<void>;
    bulkAddTag: (tagId: number) => Promise<void>;
    bulkRemoveTag: (tagId: number) => Promise<void>;
    bulkAddToCollection: (collectionId: number) => Promise<void>;

    // Async
    /** Reloads the listing. `reset` starts again from the first page; otherwise the loaded window is refreshed in place. */
    loadModels: (options?: { reset?: boolean }) => Promise<void>;
    loadMoreModels: () => Promise<void>;
    loadTags: () => Promise<void>;
    loadCollections: () => Promise<void>;
    importFiles: () => Promise<void>;
    createTag: (name: string, color: string) => Promise<void>;
    addTagToModel: (modelId: number, tagId: number) => Promise<void>;
    removeTagFromModel: (modelId: number, tagId: number) => Promise<void>;
    checkForDuplicates: () => Promise<void>;
    deleteDuplicate: (modelId: number) => Promise<void>;

    // Slicers
    loadSlicers: (rescan?: boolean) => Promise<void>;
    setDefaultSlicer: (id: string | null) => Promise<void>;
    addCustomSlicer: () => Promise<void>;
    removeCustomSlicer: (id: string) => Promise<void>;
    openInSlicer: (modelPath: string, slicerId?: string) => Promise<string | null>;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let loadSequence = 0;

function currentFilters(state: Pick<AppState, 'searchQuery' | 'selectedCollection' | 'selectedTags' | 'sortBy' | 'sortOrder'>): FilterOptions {
    return {
        collectionId: state.selectedCollection ?? undefined,
        tagIds: state.selectedTags.length > 0 ? state.selectedTags : undefined,
        searchQuery: state.searchQuery.trim() || undefined,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
    };
}

export const useStore = create<AppState>((set, get) => ({
    models: [],
    totalModels: 0,
    isLoadingMore: false,
    tags: [],
    collections: [],

    selectedCollection: null,
    selectedTags: [],
    searchQuery: '',
    sortBy: 'created',
    sortOrder: 'desc',

    viewMode: 'grid',
    selectedModel: null,
    isViewerOpen: false,
    isSettingsOpen: false,
    isDuplicatesModalOpen: false,
    duplicateGroups: [],
    nearDuplicateGroups: [],
    wastedSpace: null,
    selectedModels: new Set<number>(),
    selectionMode: false,
    selectionAnchor: null,
    isLoading: false,
    indexProgress: null,
    libraryStats: null,
    slicers: [],
    importZipDialog: { open: false, zipPaths: [] },
    updateStatus: null,
    dismissedUpdateVersion: null,
    toasts: [],
    aiSettings: null,
    bedSize: null,
    aiProgress: null,
    lastTranslation: null,
    isTranslating: false,
    theme: readStoredTheme(),

    loadAiSettings: async () => {
        try {
            set({ aiSettings: await window.electronAPI.getAiSettings() });
        } catch (error) {
            get().reportError('Could not load the AI settings', error);
        }
    },
    updateAiSettings: async (update) => {
        try {
            set({ aiSettings: await window.electronAPI.updateAiSettings(update) });
        } catch (error) {
            get().reportError('Could not save the AI settings', error);
        }
    },
    loadBedSize: async () => {
        try {
            set({ bedSize: await window.electronAPI.getBedSize() });
        } catch (error) {
            get().reportError('Could not load the printer bed size', error);
        }
    },
    updateBedSize: async (bed) => {
        try {
            set({ bedSize: await window.electronAPI.setBedSize(bed) });
        } catch (error) {
            get().reportError('Could not save the printer bed size', error);
        }
    },
    setAiProgress: (progress) => set({ aiProgress: progress }),
    askSearch: async (text) => {
        const input = text.trim();
        if (!input) return;
        set({ isTranslating: true });
        try {
            const translation = await window.electronAPI.translateSearch(input);
            set({ lastTranslation: translation, isTranslating: false });
            get().setSearchQuery(translation.query);
        } catch (error) {
            set({ isTranslating: false });
            get().reportError('The assistant could not interpret that', error);
        }
    },
    clearTranslation: () => set({ lastTranslation: null }),
    enrichModels: async (target) => {
        try {
            const queued = await window.electronAPI.enrichModels(target);
            get().pushToast({
                kind: 'info',
                title: queued > 0 ? `Analysing ${queued} model${queued === 1 ? '' : 's'} with AI` : 'Nothing new to analyse',
                message: queued > 0 ? 'Progress shows in the sidebar; results appear as they come in.' : undefined,
            });
        } catch (error) {
            get().reportError('Could not start the AI analysis', error);
        }
    },
    cancelEnrichment: async () => {
        try {
            await window.electronAPI.cancelEnrichment();
        } catch (error) {
            get().reportError('Could not stop the AI analysis', error);
        }
    },
    applySuggestedTags: async (modelId) => {
        try {
            const added = await window.electronAPI.applySuggestedTags(modelId);
            get().pushToast({ kind: added > 0 ? 'success' : 'info', title: added > 0 ? `Added ${added} tag${added === 1 ? '' : 's'}` : 'Those tags are already applied' });
            await get().loadModels();
        } catch (error) {
            get().reportError('Could not apply the suggested tags', error);
        }
    },

    pushToast: (toast) => {
        const id = nextToastId++;
        set((state) => ({ toasts: [...state.toasts.slice(-4), { id, kind: toast.kind, title: toast.title, message: toast.message }] }));
        const timeout = toast.timeout ?? (toast.kind === 'error' || toast.kind === 'warning' ? 9000 : 4500);
        if (timeout > 0) setTimeout(() => get().dismissToast(id), timeout);
        return id;
    },
    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
    reportError: (title, error) => {
        console.error(title, error);
        get().pushToast({ kind: 'error', title, message: describeError(error) });
    },

    setTheme: (theme) => {
        set({ theme });
        try {
            localStorage.setItem('theme', theme);
        } catch {
            // storage unavailable
        }
        applyThemeToDom(theme);
    },

    setCollections: (collections) => set({ collections }),

    setSelectedCollection: (id) => {
        set({ selectedCollection: id });
        void get().loadModels({ reset: true });
    },

    toggleTag: (tagId) => {
        set((state) => ({
            selectedTags: state.selectedTags.includes(tagId)
                ? state.selectedTags.filter((id) => id !== tagId)
                : [...state.selectedTags, tagId],
        }));
        void get().loadModels({ reset: true });
    },

    setSearchQuery: (query) => {
        const { searchQuery: previous, sortBy } = get();
        const hadText = previous.trim() !== '';
        const hasText = query.trim() !== '';
        // Free text ranks by relevance unless the user picked another order; clearing it restores the default.
        const nextSort = !hadText && hasText && sortBy === 'created' ? 'relevance'
            : hadText && !hasText && sortBy === 'relevance' ? 'created'
            : sortBy;
        set({ searchQuery: query, sortBy: nextSort });
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchTimer = null;
            void get().loadModels({ reset: true });
        }, SEARCH_DEBOUNCE_MS);
    },

    setSortBy: (sortBy) => {
        set({ sortBy });
        void get().loadModels({ reset: true });
    },

    setSortOrder: (sortOrder) => {
        set({ sortOrder });
        void get().loadModels({ reset: true });
    },

    setViewMode: (mode) => set({ viewMode: mode }),
    openViewer: (model) => set({ selectedModel: model, isViewerOpen: true }),
    closeViewer: () => set({ isViewerOpen: false, selectedModel: null }),
    openSettings: () => set({ isSettingsOpen: true }),
    closeSettings: () => set({ isSettingsOpen: false }),
    openDuplicatesModal: () => set({ isDuplicatesModalOpen: true }),
    closeDuplicatesModal: () => set({ isDuplicatesModalOpen: false, duplicateGroups: [], nearDuplicateGroups: [], wastedSpace: null }),
    setIndexProgress: (progress) => set({ indexProgress: progress }),
    openImportZip: (zipPaths) =>
        set((state) => ({
            importZipDialog: {
                open: true,
                zipPaths: [...new Set([...(state.importZipDialog.open ? state.importZipDialog.zipPaths : []), ...(zipPaths ?? [])])],
            },
        })),
    closeImportZip: () => set({ importZipDialog: { open: false, zipPaths: [] } }),
    setUpdateStatus: (status) => set({ updateStatus: status }),
    dismissUpdateBanner: () => set((state) => ({ dismissedUpdateVersion: state.updateStatus?.version ?? null })),
    checkForUpdates: async () => {
        try {
            set({ updateStatus: await window.electronAPI.checkForUpdates() });
        } catch (error) {
            get().reportError('Update check failed', error);
        }
    },
    downloadUpdate: async () => {
        try {
            await window.electronAPI.downloadUpdate();
        } catch (error) {
            get().reportError('Update download failed', error);
        }
    },
    installUpdate: async () => {
        try {
            await window.electronAPI.installUpdate();
        } catch (error) {
            get().reportError('Could not install the update', error);
        }
    },

    setSelectionMode: (on) => set(on ? { selectionMode: true } : { selectionMode: false, selectedModels: new Set<number>(), selectionAnchor: null }),
    toggleModelSelection: (id, index) =>
        set((state) => {
            const next = new Set(state.selectedModels);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { selectedModels: next, selectionAnchor: index ?? state.selectionAnchor };
        }),
    selectRangeTo: (index) =>
        set((state) => {
            const anchor = state.selectionAnchor ?? index;
            const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
            const next = new Set(state.selectedModels);
            for (const model of state.models.slice(from, to + 1)) next.add(model.id);
            return { selectedModels: next };
        }),
    selectAllModels: () => set((state) => ({ selectedModels: new Set(state.models.map((m) => m.id)) })),
    clearSelection: () => set({ selectedModels: new Set<number>(), selectionMode: false, selectionAnchor: null }),

    loadModels: async (options) => {
        const sequence = ++loadSequence;
        const { models: current } = get();
        const reset = options?.reset ?? false;
        // Only show the spinner on first load; later refreshes swap data in place.
        if (current.length === 0) set({ isLoading: true });

        try {
            // A refresh keeps the window the user has already scrolled through; a filter change starts over.
            const limit = reset ? PAGE_SIZE : Math.max(PAGE_SIZE, current.length);
            const [page, libraryStats] = await Promise.all([
                window.electronAPI.getModels({ ...currentFilters(get()), limit, offset: 0 }),
                window.electronAPI.getLibraryStats(),
            ]);
            if (sequence !== loadSequence) return; // a newer request finished first

            const selectedId = get().selectedModel?.id;
            const refreshedSelection = selectedId ? page.items.find((m) => m.id === selectedId) : undefined;
            set({
                models: page.items,
                totalModels: page.total,
                libraryStats,
                isLoadingMore: false,
                ...(refreshedSelection ? { selectedModel: refreshedSelection } : {}),
            });
        } catch (error) {
            get().reportError('Could not load models', error);
        } finally {
            if (sequence === loadSequence) set({ isLoading: false });
        }
    },

    loadMoreModels: async () => {
        const { models, totalModels, isLoadingMore, isLoading } = get();
        if (isLoadingMore || isLoading || models.length >= totalModels) return;
        const sequence = loadSequence;
        set({ isLoadingMore: true });
        try {
            const page = await window.electronAPI.getModels({ ...currentFilters(get()), limit: PAGE_SIZE, offset: models.length });
            if (sequence !== loadSequence) return; // filters changed meanwhile; the refresh wins
            const known = new Set(get().models.map((m) => m.id));
            set({
                models: [...get().models, ...page.items.filter((m) => !known.has(m.id))],
                totalModels: page.total,
            });
        } catch (error) {
            get().reportError('Could not load more models', error);
        } finally {
            if (sequence === loadSequence) set({ isLoadingMore: false });
        }
    },

    loadTags: async () => {
        try {
            set({ tags: await window.electronAPI.getTags() });
        } catch (error) {
            get().reportError('Could not load tags', error);
        }
    },

    loadCollections: async () => {
        try {
            set({ collections: await window.electronAPI.getCollections() });
        } catch (error) {
            get().reportError('Could not load collections', error);
        }
    },

    importFiles: async () => {
        try {
            await window.electronAPI.importFiles();
            await get().loadModels();
        } catch (error) {
            get().reportError('Import failed', error);
        }
    },

    createTag: async (name, color) => {
        try {
            await window.electronAPI.createTag(name, color);
            await get().loadTags();
        } catch (error) {
            get().reportError(`Could not create tag "${name}"`, error);
        }
    },

    addTagToModel: async (modelId, tagId) => {
        const { models, selectedModel, tags } = get();
        const tag = tags.find((t) => t.id === tagId);
        if (tag) {
            const withTag = (m: ModelWithTags) =>
                m.id === modelId && !m.tags.some((t) => t.id === tagId) ? { ...m, tags: [...m.tags, tag] } : m;
            set({
                models: models.map(withTag),
                selectedModel: selectedModel ? withTag(selectedModel) : null,
            });
        }
        try {
            await window.electronAPI.addTagToModel(modelId, tagId);
        } catch (error) {
            get().reportError('Could not add tag', error);
            await get().loadModels();
        }
    },

    removeTagFromModel: async (modelId, tagId) => {
        const { models, selectedModel } = get();
        const withoutTag = (m: ModelWithTags) =>
            m.id === modelId ? { ...m, tags: m.tags.filter((t) => t.id !== tagId) } : m;
        set({
            models: models.map(withoutTag),
            selectedModel: selectedModel ? withoutTag(selectedModel) : null,
        });
        try {
            await window.electronAPI.removeTagFromModel(modelId, tagId);
        } catch (error) {
            get().reportError('Could not remove tag', error);
            await get().loadModels();
        }
    },

    checkForDuplicates: async () => {
        set({ isLoading: true });
        try {
            const report = await window.electronAPI.findDuplicates();
            set({
                duplicateGroups: report.groups,
                nearDuplicateGroups: report.nearDuplicateGroups,
                wastedSpace: { totalWasted: report.totalWasted, groupCount: report.groupCount, unhashedCount: report.unhashedCount },
            });
        } catch (error) {
            get().reportError('Duplicate scan failed', error);
        } finally {
            set({ isLoading: false });
        }
    },

    deleteDuplicate: async (modelId) => {
        try {
            await window.electronAPI.deleteFile(modelId);
            await get().checkForDuplicates();
            await get().loadModels();
        } catch (error) {
            get().reportError('Could not remove the duplicate', error);
        }
    },

    bulkDelete: async () => {
        const ids = Array.from(get().selectedModels);
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map((id) => window.electronAPI.deleteFile(id)));
            set({ selectedModels: new Set<number>(), selectionMode: false, selectionAnchor: null });
            await get().loadModels();
        } catch (error) {
            get().reportError('Could not remove the selected models', error);
        }
    },

    loadSlicers: async (rescan) => {
        try {
            set({ slicers: await window.electronAPI.getSlicers(rescan) });
        } catch (error) {
            get().reportError('Could not look for slicers', error);
        }
    },

    setDefaultSlicer: async (id) => {
        try {
            await window.electronAPI.setDefaultSlicer(id);
            await get().loadSlicers();
        } catch (error) {
            get().reportError('Could not save the default slicer', error);
        }
    },

    addCustomSlicer: async () => {
        try {
            const added = await window.electronAPI.addCustomSlicer();
            if (added) {
                await get().loadSlicers();
                get().pushToast({ kind: 'success', title: `Added ${added.name}` });
            }
        } catch (error) {
            get().reportError('Could not add the slicer', error);
        }
    },

    removeCustomSlicer: async (id) => {
        try {
            await window.electronAPI.removeCustomSlicer(id);
            await get().loadSlicers();
        } catch (error) {
            get().reportError('Could not remove the slicer', error);
        }
    },

    /** Returns an error message on failure, null on success. */
    openInSlicer: async (modelPath, slicerId) => {
        try {
            await window.electronAPI.openInSlicer(modelPath, slicerId);
            return null;
        } catch (error) {
            console.error('Failed to open in slicer:', error);
            return describeError(error, 'Could not open the slicer');
        }
    },

    bulkAddTag: async (tagId) => {
        const ids = Array.from(get().selectedModels);
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map((id) => window.electronAPI.addTagToModel(id, tagId)));
            await get().loadModels();
        } catch (error) {
            get().reportError('Could not add the tag to the selection', error);
        }
    },

    bulkRemoveTag: async (tagId) => {
        const ids = Array.from(get().selectedModels);
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map((id) => window.electronAPI.removeTagFromModel(id, tagId)));
            await get().loadModels();
        } catch (error) {
            get().reportError('Could not remove the tag from the selection', error);
        }
    },

    bulkAddToCollection: async (collectionId) => {
        const ids = Array.from(get().selectedModels);
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map((id) => window.electronAPI.addModelToCollection(id, collectionId)));
            await get().loadModels();
        } catch (error) {
            get().reportError('Could not add the selection to the collection', error);
        }
    },
}));

applyThemeToDom(useStore.getState().theme);
