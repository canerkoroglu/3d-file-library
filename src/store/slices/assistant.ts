import { attempt, type AssistantSlice, type Slice } from '../types';

export const createAssistantSlice: Slice<AssistantSlice> = (set, get) => ({
    aiSettings: null,
    aiProgress: null,
    bedSize: null,
    lastTranslation: null,
    isTranslating: false,

    loadAiSettings: async () => {
        await attempt(get, 'Could not load the AI settings', async () => set({ aiSettings: await window.electronAPI.getAiSettings() }));
    },
    updateAiSettings: async (update) => {
        await attempt(get, 'Could not save the AI settings', async () => set({ aiSettings: await window.electronAPI.updateAiSettings(update) }));
    },
    loadBedSize: async () => {
        await attempt(get, 'Could not load the printer bed size', async () => set({ bedSize: await window.electronAPI.getBedSize() }));
    },
    updateBedSize: async (bed) => {
        await attempt(get, 'Could not save the printer bed size', async () => set({ bedSize: await window.electronAPI.setBedSize(bed) }));
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
        await attempt(get, 'Could not start the AI analysis', async () => {
            const queued = await window.electronAPI.enrichModels(target);
            get().pushToast({
                kind: 'info',
                title: queued > 0 ? `Analysing ${queued} model${queued === 1 ? '' : 's'} with AI` : 'Nothing new to analyse',
                message: queued > 0 ? 'Progress shows in the sidebar; results appear as they come in.' : undefined,
            });
        });
    },
    cancelEnrichment: async () => {
        await attempt(get, 'Could not stop the AI analysis', () => window.electronAPI.cancelEnrichment());
    },
    applySuggestedTags: async (modelId) => {
        await attempt(get, 'Could not apply the suggested tags', async () => {
            const added = await window.electronAPI.applySuggestedTags(modelId);
            get().pushToast({ kind: added > 0 ? 'success' : 'info', title: added > 0 ? `Added ${added} tag${added === 1 ? '' : 's'}` : 'Those tags are already applied' });
            await get().loadModels();
        });
    },
});
