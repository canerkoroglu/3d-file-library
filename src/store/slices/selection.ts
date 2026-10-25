import { attempt, type SelectionSlice, type Slice } from '../types';

export const createSelectionSlice: Slice<SelectionSlice> = (set, get) => {
    /** Runs `action` for every selected model, then refreshes the listing. */
    const forSelection = async (errorTitle: string, action: (id: number) => Promise<unknown>): Promise<boolean> => {
        const ids = Array.from(get().selectedModels);
        if (ids.length === 0) return false;
        const done = await attempt(get, errorTitle, async () => {
            await Promise.all(ids.map(action));
            return true;
        });
        return done === true;
    };

    return {
        selectedModels: new Set<number>(),
        selectionMode: false,
        selectionAnchor: null,

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

        bulkDelete: async () => {
            if (await forSelection('Could not remove the selected models', (id) => window.electronAPI.deleteFile(id))) {
                set({ selectedModels: new Set<number>(), selectionMode: false, selectionAnchor: null });
                await get().loadModels();
            }
        },
        bulkAddTag: async (tagId) => {
            if (await forSelection('Could not add the tag to the selection', (id) => window.electronAPI.addTagToModel(id, tagId))) await get().loadModels();
        },
        bulkRemoveTag: async (tagId) => {
            if (await forSelection('Could not remove the tag from the selection', (id) => window.electronAPI.removeTagFromModel(id, tagId))) await get().loadModels();
        },
        bulkAddToCollection: async (collectionId) => {
            if (await forSelection('Could not add the selection to the collection', (id) => window.electronAPI.addModelToCollection(id, collectionId))) await get().loadModels();
        },
    };
};
