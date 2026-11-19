import { attempt, type DuplicatesSlice, type Slice } from '../types';

export const createDuplicatesSlice: Slice<DuplicatesSlice> = (set, get) => ({
    isScanningDuplicates: false,
    isDuplicatesModalOpen: false,
    duplicateGroups: [],
    nearDuplicateGroups: [],
    wastedSpace: null,

    openDuplicatesModal: () => set({ isDuplicatesModalOpen: true }),
    closeDuplicatesModal: () => set({ isDuplicatesModalOpen: false, duplicateGroups: [], nearDuplicateGroups: [], wastedSpace: null }),

    checkForDuplicates: async () => {
        set({ isScanningDuplicates: true });
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
            set({ isScanningDuplicates: false });
        }
    },

    deleteDuplicate: async (modelId) => {
        await attempt(get, 'Could not remove the duplicate', async () => {
            await window.electronAPI.deleteFile(modelId);
            await get().checkForDuplicates();
            await get().loadModels();
        });
    },
});
