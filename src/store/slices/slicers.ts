import { describeError } from '../../lib/errors';
import { attempt, type Slice, type SlicersSlice } from '../types';

export const createSlicersSlice: Slice<SlicersSlice> = (set, get) => ({
    slicers: [],

    loadSlicers: async (rescan) => {
        await attempt(get, 'Could not look for slicers', async () => set({ slicers: await window.electronAPI.getSlicers(rescan) }));
    },
    setDefaultSlicer: async (id) => {
        await attempt(get, 'Could not save the default slicer', async () => {
            await window.electronAPI.setDefaultSlicer(id);
            await get().loadSlicers();
        });
    },
    addCustomSlicer: async () => {
        await attempt(get, 'Could not add the slicer', async () => {
            const added = await window.electronAPI.addCustomSlicer();
            if (added) {
                await get().loadSlicers();
                get().pushToast({ kind: 'success', title: `Added ${added.name}` });
            }
        });
    },
    removeCustomSlicer: async (id) => {
        await attempt(get, 'Could not remove the slicer', async () => {
            await window.electronAPI.removeCustomSlicer(id);
            await get().loadSlicers();
        });
    },
    openInSlicer: async (modelPath, slicerId) => {
        try {
            await window.electronAPI.openInSlicer(modelPath, slicerId);
            return null;
        } catch (error) {
            console.error('Failed to open in slicer:', error);
            return describeError(error, 'Could not open the slicer');
        }
    },
});
