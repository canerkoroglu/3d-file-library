import { create } from 'zustand';
import type { ModelWithTags, Tag, Collection, FilterOptions, DuplicateGroup } from '../types';

interface AppState {
    // Data
    models: ModelWithTags[];
    tags: Tag[];
    collections: Collection[];

    // UI State
    selectedCollection: number | null;
    selectedTags: number[];
    searchQuery: string;
    viewMode: 'grid' | 'list';
    selectedModel: ModelWithTags | null;
    isViewerOpen: boolean;
    isSettingsOpen: boolean;
    isDuplicatesModalOpen: boolean;
    duplicateGroups: DuplicateGroup[];
    wastedSpace: { totalWasted: number; groupCount: number } | null;

    // Bulk operations
    selectedModels: Set<number>;

    // Sorting
    sortBy: 'name' | 'created' | 'modified' | 'size';
    sortOrder: 'asc' | 'desc';

    // Theme
    theme: 'dark' | 'light' | 'system';
    setTheme: (theme: 'dark' | 'light' | 'system') => void;

    // Loading states
    isLoading: boolean;

    // Actions
    setModels: (models: ModelWithTags[]) => void;
    setTags: (tags: Tag[]) => void;
    setCollections: (collections: Collection[]) => void;
    setSelectedCollection: (id: number | null) => void;
    toggleTag: (tagId: number) => void;
    setSearchQuery: (query: string) => void;
    setViewMode: (mode: 'grid' | 'list') => void;
    openViewer: (model: ModelWithTags) => void;
    closeViewer: () => void;
    openSettings: () => void;
    closeSettings: () => void;
    setLoading: (loading: boolean) => void;
    openDuplicatesModal: () => void;
    closeDuplicatesModal: () => void;

    // Bulk operations
    toggleModelSelection: (id: number) => void;
    selectAllModels: () => void;
    clearSelection: () => void;
    bulkDelete: () => Promise<void>;
    bulkAddTag: (tagId: number) => Promise<void>;

    // Sorting
    setSortBy: (sortBy: 'name' | 'created' | 'modified' | 'size') => void;
    setSortOrder: (order: 'asc' | 'desc') => void;

    // Async actions
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

export const useStore = create<AppState>((set, get) => ({
    // Initial state
    models: [],
    tags: [],
    collections: [],
    selectedCollection: null,
    selectedTags: [],
    searchQuery: '',
    viewMode: 'grid',
    selectedModel: null,
    isViewerOpen: false,
    isSettingsOpen: false,
    isDuplicatesModalOpen: false,
    duplicateGroups: [],
    wastedSpace: null,
    isLoading: false,

    // Bulk operations state
    selectedModels: new Set<number>(),

    // Sorting state
    sortBy: 'created',
    sortOrder: 'desc',

    // Theme state
    theme: (localStorage.getItem('theme') as 'dark' | 'light' | 'system') || 'system',
    setTheme: (theme) => {
        set({ theme });
        localStorage.setItem('theme', theme);

        // Apply theme immediately
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');

        if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.classList.add(systemTheme);
        } else {
            root.classList.add(theme);
        }
    },

    // Sync actions
    // Sync actions
    setModels: (models) => set({ models }),
    setTags: (tags) => set({ tags }),
    setCollections: (collections) => set({ collections }),

    setSelectedCollection: (id) => {
        set({ selectedCollection: id });
        get().loadModels();
    },

    toggleTag: (tagId) => {
        set((state) => ({
            selectedTags: state.selectedTags.includes(tagId)
                ? state.selectedTags.filter(id => id !== tagId)
                : [...state.selectedTags, tagId]
        }));
        get().loadModels();
    },

    setSearchQuery: (query) => {
        set({ searchQuery: query });
        // Debounce could be added here, but for now triggering loadModels
        get().loadModels();
    },

    setViewMode: (mode) => set({ viewMode: mode }),
    openViewer: (model) => set({ selectedModel: model, isViewerOpen: true }),
    closeViewer: () => set({ isViewerOpen: false, selectedModel: null }),
    openSettings: () => set({ isSettingsOpen: true }),
    closeSettings: () => set({ isSettingsOpen: false }),
    setLoading: (loading) => set({ isLoading: loading }),
    openDuplicatesModal: () => set({ isDuplicatesModalOpen: true }),
    closeDuplicatesModal: () => set({ isDuplicatesModalOpen: false, duplicateGroups: [], wastedSpace: null }),

    // Bulk operations
    toggleModelSelection: (id) => set((state) => {
        const newSelection = new Set(state.selectedModels);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        return { selectedModels: newSelection };
    }),
    selectAllModels: () => set((state) => ({
        selectedModels: new Set(state.models.map(m => m.id))
    })),
    clearSelection: () => set({ selectedModels: new Set<number>() }),

    // Sorting
    setSortBy: (sortBy) => {
        set({ sortBy });
        get().loadModels();
    },
    setSortOrder: (sortOrder) => {
        set({ sortOrder });
        get().loadModels();
    },

    // Async actions
    loadModels: async () => {
        set({ isLoading: true });
        try {
            const { searchQuery, selectedCollection, selectedTags } = get();
            let models: ModelWithTags[];

            // Use fuzzy search if there's a search query
            if (searchQuery && searchQuery.trim() !== '') {
                models = await window.electronAPI.searchModels(searchQuery);

                // Filter by collection if one is selected
                if (selectedCollection !== null) {
                    models = models.filter(m => m.collectionId === selectedCollection);
                }

                // Filter by tags locally for search results
                if (selectedTags.length > 0) {
                    models = models.filter(m =>
                        selectedTags.every(tagId => m.tags?.some(t => t.id === tagId))
                    );
                }
            } else {
                // Use regular getModels with filters
                const filters: FilterOptions = {
                    collectionId: selectedCollection ?? undefined,
                    tagIds: selectedTags.length > 0 ? selectedTags : undefined,
                    sortBy: get().sortBy,
                    sortOrder: get().sortOrder
                };
                models = await window.electronAPI.getModels(filters);
            }

            set({ models });

            // Also update selectedModel if it exists in the new list to keep it fresh
            const selectedModelId = get().selectedModel?.id;
            if (selectedModelId) {
                const updatedSelectedModel = models.find(m => m.id === selectedModelId);
                if (updatedSelectedModel) {
                    set({ selectedModel: updatedSelectedModel });
                }
            }

        } catch (error) {
            console.error('Failed to load models:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    loadTags: async () => {
        try {
            const tags = await window.electronAPI.getTags();
            set({ tags });
        } catch (error) {
            console.error('Failed to load tags:', error);
        }
    },

    loadCollections: async () => {
        try {
            const collections = await window.electronAPI.getCollections();
            set({ collections });
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
        // Optimistic update
        const { models, selectedModel, tags } = get();
        const tagToAdd = tags.find(t => t.id === tagId);

        if (tagToAdd) {
            // Update selectedModel immediately
            if (selectedModel && selectedModel.id === modelId) {
                const currentTags = selectedModel.tags || [];
                if (!currentTags.some(t => t.id === tagId)) {
                    set({ selectedModel: { ...selectedModel, tags: [...currentTags, tagToAdd] } });
                }
            }

            // Update models list immediately
            const updatedModels = models.map(m => {
                if (m.id === modelId) {
                    const currentTags = m.tags || [];
                    if (!currentTags.some(t => t.id === tagId)) {
                        return { ...m, tags: [...currentTags, tagToAdd] };
                    }
                }
                return m;
            });
            set({ models: updatedModels });
        }

        try {
            await window.electronAPI.addTagToModel(modelId, tagId);
        } catch (error) {
            console.error('Failed to add tag to model:', error);
            await get().loadModels();
        }
    },

    removeTagFromModel: async (modelId, tagId) => {
        // Optimistic update
        const { models, selectedModel } = get();

        // Update selectedModel immediately
        if (selectedModel && selectedModel.id === modelId) {
            const currentTags = selectedModel.tags || [];
            if (currentTags.some(t => t.id === tagId)) {
                set({ selectedModel: { ...selectedModel, tags: currentTags.filter(t => t.id !== tagId) } });
            }
        }

        // Update models list immediately
        const updatedModels = models.map(m => {
            if (m.id === modelId) {
                const currentTags = m.tags || [];
                if (currentTags.some(t => t.id === tagId)) {
                    return { ...m, tags: currentTags.filter(t => t.id !== tagId) };
                }
            }
            return m;
        });
        set({ models: updatedModels });

        try {
            await window.electronAPI.removeTagFromModel(modelId, tagId);
        } catch (error) {
            console.error('Failed to remove tag from model:', error);
            await get().loadModels();
        }
    },

    checkForDuplicates: async () => {
        set({ isLoading: true });
        try {
            const duplicateGroups = await window.electronAPI.findDuplicates();
            const wastedSpace = await window.electronAPI.calculateWastedSpace();
            set({ duplicateGroups, wastedSpace });
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
        const selectedIds = Array.from(get().selectedModels);
        if (selectedIds.length === 0) return;

        try {
            await Promise.all(selectedIds.map(id => window.electronAPI.deleteFile(id)));
            set({ selectedModels: new Set<number>() });
            await get().loadModels();
        } catch (error) {
            console.error('Failed to bulk delete:', error);
        }
    },

    bulkAddTag: async (tagId) => {
        const selectedIds = Array.from(get().selectedModels);
        if (selectedIds.length === 0) return;

        try {
            await Promise.all(selectedIds.map(id => window.electronAPI.addTagToModel(id, tagId)));
            await get().loadModels();
        } catch (error) {
            console.error('Failed to bulk add tag:', error);
        }
    },
}));
