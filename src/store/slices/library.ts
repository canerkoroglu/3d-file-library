import type { FilterOptions, ModelWithTags } from '../../types';
import { attempt, type AppState, type LibrarySlice, type Slice } from '../types';

const SEARCH_DEBOUNCE_MS = 200;
const PAGE_SIZE = 200;

let searchTimer: ReturnType<typeof setTimeout> | null = null;
/** Increments with every reload so a slow, outdated response never overwrites a newer one. */
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

export const createLibrarySlice: Slice<LibrarySlice> = (set, get) => ({
    models: [],
    totalModels: 0,
    isLoading: false,
    isLoadingMore: false,
    libraryStats: null,
    tags: [],
    collections: [],

    selectedCollection: null,
    selectedTags: [],
    searchQuery: '',
    sortBy: 'created',
    sortOrder: 'desc',

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
        await attempt(get, 'Could not load tags', async () => set({ tags: await window.electronAPI.getTags() }));
    },

    loadCollections: async () => {
        await attempt(get, 'Could not load collections', async () => set({ collections: await window.electronAPI.getCollections() }));
    },

    importFiles: async () => {
        await attempt(get, 'Import failed', async () => {
            await window.electronAPI.importFiles();
            await get().loadModels();
        });
    },

    createTag: async (name, color) => {
        await attempt(get, `Could not create tag "${name}"`, async () => {
            await window.electronAPI.createTag(name, color);
            await get().loadTags();
        });
    },

    // Tag changes are applied to the screen first and undone by a reload if the save fails.
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

    patchModel: (modelId, update) => {
        const { models, selectedModel } = get();
        set({
            models: models.map((m) => (m.id === modelId ? update(m) : m)),
            selectedModel: selectedModel?.id === modelId ? update(selectedModel) : selectedModel,
        });
    },
});
