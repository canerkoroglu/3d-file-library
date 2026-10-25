import { attempt, type Slice, type Theme, type UiSlice } from '../types';

export function applyThemeToDom(theme: Theme): void {
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

export const createUiSlice: Slice<UiSlice> = (set, get) => ({
    theme: readStoredTheme(),
    viewMode: 'grid',
    selectedModel: null,
    isViewerOpen: false,
    isSettingsOpen: false,
    importZipDialog: { open: false, zipPaths: [] },
    indexProgress: null,
    updateStatus: null,
    dismissedUpdateVersion: null,

    setTheme: (theme) => {
        set({ theme });
        try {
            localStorage.setItem('theme', theme);
        } catch {
            // storage unavailable
        }
        applyThemeToDom(theme);
    },
    setViewMode: (mode) => set({ viewMode: mode }),
    openViewer: (model) => set({ selectedModel: model, isViewerOpen: true }),
    closeViewer: () => set({ isViewerOpen: false, selectedModel: null }),
    openSettings: () => set({ isSettingsOpen: true }),
    closeSettings: () => set({ isSettingsOpen: false }),
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
        await attempt(get, 'Update check failed', async () => set({ updateStatus: await window.electronAPI.checkForUpdates() }));
    },
    downloadUpdate: async () => {
        await attempt(get, 'Update download failed', () => window.electronAPI.downloadUpdate());
    },
    installUpdate: async () => {
        await attempt(get, 'Could not install the update', () => window.electronAPI.installUpdate());
    },
});
