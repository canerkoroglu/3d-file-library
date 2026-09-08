import { create } from 'zustand';
import type {
    Collection,
    DuplicateGroup,
    FilterOptions,
    IndexProgress,
    LibraryStats,
    ModelWithTags,
    SortBy,
    SortOrder,
    Tag,
} from '../types';

type Theme = 'dark' | 'light' | 'system';

const SEARCH_DEBOUNCE_MS = 200;

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
    models: ModelWithTags[];
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
    isLoading: boolean;
    indexProgress: IndexProgress | null;
    libraryStats: LibraryStats | null;
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

    // Selection
    toggleModelSelection: (id: number) => void;
    selectAllModels: () => void;
    clearSelection: () => void;
    bulkDelete: () => Promise<void>;
    bulkAddTag: (tagId: number) => Promise<void>;

    // Async
    loadModels: () => Promise<void>;
    loadTags: () => Promise<void>;
    loadCollections: () => Promise<void>;
    importFiles: () => Promise<void>;
    createTag: (name: string, color: string) => Promise<void>;
    addTagToModel: (modelId: number, tagId: number) => Promise<void>;
    removeTagFromModel: (modelId: number, tagId: number) => Promise<void>;
    checkForDuplicates: () => Promise<void>;
    deleteDuplicate: (modelId: number) => Promise<void>;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let loadSequence = 0;

export const useStore = create<AppState>((set, get) => ({
    models: [],
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
    isLoading: false,
    indexProgress: null,
    libraryStats: null,
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
        void get().loadModels();
    },

    toggleTag: (tagId) => {
        set((state) => ({
            selectedTags: state.selectedTags.includes(tagId)
                ? state.selectedTags.filter((id) => id !== tagId)
                : [...state.selectedTags, tagId],
        }));
        void get().loadModels();
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
            void get().loadModels();
        }, SEARCH_DEBOUNCE_MS);
    },

    setSortBy: (sortBy) => {
        set({ sortBy });
        void get().loadModels();
    },

    setSortOrder: (sortOrder) => {
        set({ sortOrder });
        void get().loadModels();
    },

    setViewMode: (mode) => set({ viewMode: mode }),
    openViewer: (model) => set({ selectedModel: model, isViewerOpen: true }),
    closeViewer: () => set({ isViewerOpen: false, selectedModel: null }),
    openSettings: () => set({ isSettingsOpen: true }),
    closeSettings: () => set({ isSettingsOpen: false }),
    openDuplicatesModal: () => set({ isDuplicatesModalOpen: true }),
    closeDuplicatesModal: () => set({ isDuplicatesModalOpen: false, duplicateGroups: [], wastedSpace: null }),
    setIndexProgress: (progress) => set({ indexProgress: progress }),

    toggleModelSelection: (id) =>
        set((state) => {
            const next = new Set(state.selectedModels);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { selectedModels: next };
        }),
    selectAllModels: () => set((state) => ({ selectedModels: new Set(state.models.map((m) => m.id)) })),
    clearSelection: () => set({ selectedModels: new Set<number>() }),

    loadModels: async () => {
        const sequence = ++loadSequence;
        const { models: current } = get();
        // Only show the spinner on first load; later refreshes swap data in place.
        if (current.length === 0) set({ isLoading: true });

        try {
            const { searchQuery, selectedCollection, selectedTags, sortBy, sortOrder } = get();
            const filters: FilterOptions = {
                collectionId: selectedCollection ?? undefined,
                tagIds: selectedTags.length > 0 ? selectedTags : undefined,
                searchQuery: searchQuery.trim() || undefined,
                sortBy,
                sortOrder,
            };
            const [models, libraryStats] = await Promise.all([
                window.electronAPI.getModels(filters),
                window.electronAPI.getLibraryStats(),
            ]);
            if (sequence !== loadSequence) return; // a newer request finished first

            const selectedId = get().selectedModel?.id;
            const refreshedSelection = selectedId ? models.find((m) => m.id === selectedId) : undefined;
            set({
                models,
                libraryStats,
                ...(refreshedSelection ? { selectedModel: refreshedSelection } : {}),
            });
        } catch (error) {
            console.error('Failed to load models:', error);
        } finally {
            if (sequence === loadSequence) set({ isLoading: false });
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
            set({ selectedModels: new Set<number>() });
            await get().loadModels();
        } catch (error) {
            console.error('Failed to bulk delete:', error);
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
}));

applyThemeToDom(useStore.getState().theme);
