import { useEffect, useState } from 'react';
import { FileArchive } from 'lucide-react';
import { useStore } from './store/store';
import Sidebar from './components/Sidebar';
import FilterBar from './components/FilterBar';
import ModelGrid from './components/ModelGrid';
import ModelViewer from './components/ModelViewer';
import DuplicatesModal from './components/DuplicatesModal';
import SettingsModal from './components/SettingsModal';
import BulkActionsBar from './components/BulkActionsBar';
import ImportZipDialog from './components/ImportZipDialog';
import UpdateBanner from './components/UpdateBanner';
import ToastHost from './components/ToastHost';
import { describeError } from './lib/errors';

function App() {
    const { loadModels, loadTags, loadCollections, loadSlicers, setIndexProgress, setUpdateStatus, pushToast, isViewerOpen, isDuplicatesModalOpen, isSettingsOpen, importZipDialog, openImportZip, selectAllModels, clearSelection } = useStore();

    // Unexpected renderer failures become a toast instead of vanishing into the console.
    useEffect(() => {
        const onRejection = (e: PromiseRejectionEvent) => pushToast({ kind: 'error', title: 'Something went wrong', message: describeError(e.reason) });
        const onError = (e: ErrorEvent) => pushToast({ kind: 'error', title: 'Something went wrong', message: describeError(e.error ?? e.message) });
        window.addEventListener('unhandledrejection', onRejection);
        window.addEventListener('error', onError);
        return () => {
            window.removeEventListener('unhandledrejection', onRejection);
            window.removeEventListener('error', onError);
        };
    }, [pushToast]);
    const [dragDepth, setDragDepth] = useState(0);
    const modalOpen = isViewerOpen || isDuplicatesModalOpen || isSettingsOpen || importZipDialog.open;

    // Esc clears the selection; ⌘/Ctrl+A selects every loaded model (unless typing in a field or a dialog is open).
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (modalOpen) return;
            const target = e.target as HTMLElement | null;
            const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
            if (e.key === 'Escape' && !typing) clearSelection();
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !typing) {
                e.preventDefault();
                selectAllModels();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [modalOpen, selectAllModels, clearSelection]);

    // Dropping ZIP archives opens the importer; dropping model files registers them in place.
    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;
        const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            setDragDepth((d) => d + 1);
        };
        const onDragLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            setDragDepth((d) => Math.max(0, d - 1));
        };
        const onDragOver = (e: DragEvent) => {
            if (hasFiles(e)) e.preventDefault();
        };
        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            setDragDepth(0);
            const paths = Array.from(e.dataTransfer?.files ?? []).map((f) => api.getPathForFile(f)).filter(Boolean);
            const zips = paths.filter((p) => /\.zip$/i.test(p));
            const models = paths.filter((p) => /\.(stl|3mf|obj)$/i.test(p));
            if (zips.length > 0) openImportZip(zips);
            if (models.length > 0) {
                api.importFilePaths(models)
                    .then((count) => {
                        pushToast({ kind: count > 0 ? 'success' : 'info', title: count > 0 ? `Added ${count} model${count === 1 ? '' : 's'}` : 'Those files are already in the library' });
                        if (count > 0) void loadModels();
                    })
                    .catch((error) => pushToast({ kind: 'error', title: 'Import failed', message: describeError(error) }));
            }
        };
        window.addEventListener('dragenter', onDragEnter);
        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragenter', onDragEnter);
            window.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('drop', onDrop);
        };
    }, [openImportZip, loadModels, pushToast]);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;

        const init = async () => {
            try {
                await Promise.all([loadTags(), loadCollections()]);
                await loadModels();
                setIndexProgress(await api.getIndexProgress());
                void loadSlicers();
                setUpdateStatus(await api.getUpdateStatus());
            } catch (error) {
                console.error('Failed to initialize app data:', error);
            }
        };
        void init();

        const unsubscribeModels = api.onModelsUpdated(() => {
            void loadModels();
        });
        const unsubscribeCollections = api.onCollectionsUpdated(() => {
            void loadCollections();
        });
        const unsubscribeProgress = api.onIndexProgress((progress) => setIndexProgress(progress));
        const unsubscribeUpdates = api.onUpdateStatus((status) => setUpdateStatus(status));
        const unsubscribeNotices = api.onAppNotice((notice) => pushToast(notice));

        return () => {
            unsubscribeModels();
            unsubscribeCollections();
            unsubscribeProgress();
            unsubscribeUpdates();
            unsubscribeNotices();
        };
    }, [loadModels, loadTags, loadCollections, loadSlicers, setIndexProgress, setUpdateStatus, pushToast]);

    return (
        <div className="h-screen w-screen flex flex-col bg-primary-bg overflow-hidden text-text-primary transition-colors duration-200">
            {/* Title bar */}
            <div
                className="h-12 bg-primary-card border-b border-accent-gray flex items-center justify-center px-20 flex-shrink-0 relative"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                <span className="text-sm font-medium text-text-primary tracking-wide">Modelist</span>
                {!window.electronAPI && (
                    <div className="absolute right-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                        <span className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded border border-red-500/30">
                            API Disconnected
                        </span>
                    </div>
                )}
            </div>

            <div className="flex-1 flex overflow-hidden min-h-0">
                <Sidebar />
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    <FilterBar />
                    <ModelGrid />
                </div>
            </div>

            {isViewerOpen && <ModelViewer />}
            {isDuplicatesModalOpen && <DuplicatesModal />}
            {isSettingsOpen && <SettingsModal />}
            {importZipDialog.open && <ImportZipDialog />}
            <BulkActionsBar />
            <UpdateBanner />
            <ToastHost />

            {dragDepth > 0 && (
                <div className="fixed inset-0 z-[70] bg-accent-blue/10 border-4 border-dashed border-accent-blue pointer-events-none flex items-center justify-center">
                    <div className="bg-primary-card border border-accent-gray rounded-xl px-6 py-4 shadow-2xl flex items-center gap-3 text-text-primary">
                        <FileArchive size={22} className="text-accent-blue" />
                        Drop ZIP archives or STL / 3MF / OBJ files to import
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
