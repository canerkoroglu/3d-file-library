import { useEffect } from 'react';
import { useStore } from './store/store';
import Sidebar from './components/Sidebar';
import FilterBar from './components/FilterBar';
import ModelGrid from './components/ModelGrid';
import ModelViewer from './components/ModelViewer';
import DuplicatesModal from './components/DuplicatesModal';
import SettingsModal from './components/SettingsModal';
import BulkActionsBar from './components/BulkActionsBar';

function App() {
    const { loadModels, loadTags, loadCollections, setIndexProgress, isViewerOpen, isDuplicatesModalOpen, isSettingsOpen } = useStore();

    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;

        const init = async () => {
            try {
                await Promise.all([loadTags(), loadCollections()]);
                await loadModels();
                setIndexProgress(await api.getIndexProgress());
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

        return () => {
            unsubscribeModels();
            unsubscribeCollections();
            unsubscribeProgress();
        };
    }, [loadModels, loadTags, loadCollections, setIndexProgress]);

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
            <BulkActionsBar />
        </div>
    );
}

export default App;
