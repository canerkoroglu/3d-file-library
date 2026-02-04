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
    const {
        loadModels,
        loadTags,
        loadCollections,
        isViewerOpen,
        isDuplicatesModalOpen,
        isSettingsOpen
    } = useStore();

    useEffect(() => {
        // Load initial data safely
        const initApp = async () => {
            try {
                // Load tags and collections first
                await Promise.all([
                    loadTags(),
                    loadCollections()
                ]);
                // Then load models (might depend on filters)
                await loadModels();
                console.log("App initialized successfully");
            } catch (error) {
                console.error("Failed to initialize app data:", error);
            }
        };

        initApp();

        // Listen for model updates
        if (window.electronAPI?.onModelsUpdated) {
            window.electronAPI.onModelsUpdated(() => {
                console.log("Models updated event received");
                loadModels();
            });
        }
    }, [loadModels, loadTags, loadCollections]);

    return (
        <div className="h-screen w-screen flex flex-col bg-[#1a1a1a] overflow-hidden text-white">
            {/* Title bar - macOS style with centered title */}
            <div className="h-12 bg-[#2d2d2d] border-b border-[#404040] flex items-center justify-center px-20 flex-shrink-0 relative" style={{ WebkitAppRegion: 'drag' } as any}>
                {/* Centered title */}
                <span className="text-sm font-medium text-[#e0e0e0] tracking-wide">Modelist</span>

                {/* API status badge - positioned absolutely on the right */}
                {!window.electronAPI && (
                    <div className="absolute right-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
                        <span className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded border border-red-500/30">
                            API Disconnected
                        </span>
                    </div>
                )}
            </div>

            {/* Main content area */}
            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Sidebar */}
                <Sidebar />

                {/* Main content */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    {/* Filter bar */}
                    <FilterBar />

                    {/* Model grid */}
                    <ModelGrid />
                </div>
            </div>

            {/* Model viewer modal */}
            {isViewerOpen && <ModelViewer />}

            {/* Duplicates finder modal */}
            {isDuplicatesModalOpen && <DuplicatesModal />}

            {/* Settings modal */}
            {isSettingsOpen && <SettingsModal />}

            {/* Bulk actions bar */}
            <BulkActionsBar />
        </div>
    );
}

export default App;
