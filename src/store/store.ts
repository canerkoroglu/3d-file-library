import { create } from 'zustand';
import type {
    Collection,
    DuplicateGroup,
    FilterOptions,
    IndexProgress,
    LibraryStats,
    ModelWithTags,
    Slicer,
    SortBy,
    SortOrder,
    Tag,
} from '../types';

type Theme = 'dark' | 'light' | 'system';

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
    theme: Theme;

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
    wastedSpace: null,
    selectedModels: new Set<number>(),
    selectionMode: false,
    selectionAnchor: null,
    isLoading: false,
    indexProgress: null,
    libraryStats: null,
    slicers: [],
    importZipDialog: { open: false, zipPaths: [] },
    theme: readStoredTheme(),

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
    closeDuplicatesModal: () => set({ isDuplicatesModalOpen: false, duplicateGroups: [], wastedSpace: null }),
    setIndexProgress: (progress) => set({ indexProgress: progress }),
    openImportZip: (zipPaths) =>
        set((state) => ({
            importZipDialog: {
                open: true,
                zipPaths: [...new Set([...(state.importZipDialog.open ? state.importZipDialog.zipPaths : []), ...(zipPaths ?? [])])],
            },
        })),
    closeImportZip: () => set({ importZipDialog: { open: false, zipPaths: [] } }),

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
            console.error('Failed to load models:', error);
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
            console.error('Failed to load more models:', error);
        } finally {
            if (sequence === loadSequence) set({ isLoadingMore: false });
        }
    },

    loadTags: async () => {
        try {
            set({ tags: await window.electronAPI.getTags() });
        } catch (error) {
            console.error('Failed to load tags:', error);
        }
    },

    loadCollections: async () => {
        try {
            set({ collections: await window.electronAPI.getCollections() });
        } catch (error) {
            console.error('Failed to load collections:', error);
        }
    },

    importFiles: async () => {
        try {
            await window.electronAPI.importFiles();
            await get().loadModels();
        } catch (error) {
            console.error('Failed to import files:', error);
        }
    },

    createTag: async (name, color) => {
        try {
            await window.electronAPI.createTag(name, color);
            await get().loadTags();
        } catch (error) {
            console.error('Failed to create tag:', error);
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
            console.error('Failed to add tag:', error);
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
            console.error('Failed to remove tag:', error);
            await get().loadModels();
        }
    },

    checkForDuplicates: async () => {
        set({ isLoading: true });
        try {
            const report = await window.electronAPI.findDuplicates();
            set({
                duplicateGroups: report.groups,
                wastedSpace: { totalWasted: report.totalWasted, groupCount: report.groupCount, unhashedCount: report.unhashedCount },
            });
        } catch (error) {
            console.error('Failed to check for duplicates:', error);
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
            console.error('Failed to delete duplicate:', error);
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
            console.error('Failed to bulk delete:', error);
        }
    },

    loadSlicers: async (rescan) => {
        try {
            set({ slicers: await window.electronAPI.getSlicers(rescan) });
        } catch (error) {
            console.error('Failed to load slicers:', error);
        }
    },

    setDefaultSlicer: async (id) => {
        await window.electronAPI.setDefaultSlicer(id);
        await get().loadSlicers();
    },

    addCustomSlicer: async () => {
        const added = await window.electronAPI.addCustomSlicer();
        if (added) await get().loadSlicers();
    },

    removeCustomSlicer: async (id) => {
        await window.electronAPI.removeCustomSlicer(id);
        await get().loadSlicers();
    },

    /** Returns an error message on failure, null on success. */
    openInSlicer: async (modelPath, slicerId) => {
        try {
            await window.electronAPI.openInSlicer(modelPath, slicerId);
            return null;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to open in slicer:', message);
            return message.replace(/^Error invoking remote method '[^']+': Error: /, '');
        }
    },

    bulkAddTag: async (tagId) => {
        const ids = Array.from(get().selectedModels);
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map((id) => window.electronAPI.addTagToModel(id, tagId)));
            await get().loadModels();
        } catch (error) {
            console.error('Failed to bulk add tag:', error);
        }
    },

    bulkRemoveTag: async (tagId) => {
        const ids = Array.from(get().selectedModels);
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map((id) => window.electronAPI.removeTagFromModel(id, tagId)));
            await get().loadModels();
        } catch (error) {
            console.error('Failed to bulk remove tag:', error);
        }
    },

    bulkAddToCollection: async (collectionId) => {
        const ids = Array.from(get().selectedModels);
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map((id) => window.electronAPI.addModelToCollection(id, collectionId)));
            await get().loadModels();
        } catch (error) {
            console.error('Failed to bulk add to collection:', error);
        }
    },
}));

applyThemeToDom(useStore.getState().theme);
