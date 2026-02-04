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

    // Sync actions
    setModels: (models) => set({ models }),
    setTags: (tags) => set({ tags }),
    setCollections: (collections) => set({ collections }),
    setSelectedCollection: (id) => set({ selectedCollection: id }),
    toggleTag: (tagId) => set((state) => ({
        selectedTags: state.selectedTags.includes(tagId)
            ? state.selectedTags.filter(id => id !== tagId)
            : [...state.selectedTags, tagId]
    })),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setViewMode: (mode) => set({ viewMode: mode }),
    openViewer: (model) => set({ selectedModel: model, isViewerOpen: true }),
    closeViewer: () => set({ isViewerOpen: false, selectedModel: null }),
    openSettings: () => set({ isSettingsOpen: true }),
    closeSettings: () => set({ isSettingsOpen: false }),
    setLoading: (loading) => set({ isLoading: loading }),
    openDuplicatesModal: () => set({ isDuplicatesModalOpen: true }),
    closeDuplicatesModal: () => set({ isDuplicatesModalOpen: false, duplicateGroups: [], wastedSpace: null }),

    // Async actions
    loadModels: async () => {
        set({ isLoading: true });
        try {
            const filters: FilterOptions = {
                collectionId: get().selectedCollection ?? undefined,
                searchQuery: get().searchQuery || undefined,
            };
            const models = await window.electronAPI.getModels(filters);
            set({ models });
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
        try {
            await window.electronAPI.addTagToModel(modelId, tagId);
            await get().loadModels();
        } catch (error) {
            console.error('Failed to add tag to model:', error);
        }
    },

    removeTagFromModel: async (modelId, tagId) => {
        try {
            await window.electronAPI.removeTagFromModel(modelId, tagId);
            await get().loadModels();
        } catch (error) {
            console.error('Failed to remove tag from model:', error);
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
            // Refresh duplicates list
            await get().checkForDuplicates();
            // Refresh main model list
            await get().loadModels();
        } catch (error) {
            console.error('Failed to delete duplicate:', error);
        }
    },
}));
