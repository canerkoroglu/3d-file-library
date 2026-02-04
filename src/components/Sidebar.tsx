import { Folder, FolderOpen, Plus, Settings, Inbox, Copy } from 'lucide-react';
import { useStore } from '../store/store';

export default function Sidebar() {
    const { collections, selectedCollection, setSelectedCollection, openDuplicatesModal, openSettings } = useStore();

    const watchedFolders = collections.filter(c => c.type === 'watched');
    const userCollections = collections.filter(c => c.type === 'collection');

    const handleAddWatchedFolder = async () => {
        try {
            await window.electronAPI.addWatchedFolder('');
            // Reload collections
            const newCollections = await window.electronAPI.getCollections();
            useStore.getState().setCollections(newCollections);
        } catch (error: any) {
            // Don't show error if user just cancelled the dialog
            if (error?.message !== 'No folder selected') {
                console.error('Failed to add watched folder:', error);
            }
        }
    };

    return (
        <div className="w-60 bg-[#2d2d2d] border-r border-[#404040] flex flex-col flex-shrink-0">
            {/* Collections section */}
            <div className="flex-1 overflow-y-auto p-3 space-y-6">
                {/* All Models / Inbox */}
                <div>
                    <h3 className="text-[10px] font-bold text-[#808080] uppercase tracking-wider mb-2 px-3">
                        Collections
                    </h3>
                    <div className="space-y-0.5">
                        <button
                            onClick={() => setSelectedCollection(null)}
                            className={`sidebar-item w-full ${selectedCollection === null ? 'active' : 'inactive'}`}
                        >
                            <Inbox size={18} />
                            <span>All Models</span>
                        </button>
                        {userCollections.map((collection) => (
                            <button
                                key={collection.id}
                                onClick={() => setSelectedCollection(collection.id)}
                                className={`sidebar-item w-full ${selectedCollection === collection.id ? 'active' : 'inactive'}`}
                            >
                                <Folder size={18} />
                                <span className="truncate">{collection.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Watched folders section */}
                <div>
                    <div className="flex items-center justify-between mb-2 px-3">
                        <h3 className="text-[10px] font-bold text-[#808080] uppercase tracking-wider">
                            Watched Folders
                        </h3>
                        <button
                            onClick={handleAddWatchedFolder}
                            className="p-1.5 hover:bg-[#353535] rounded-md transition-colors group"
                            title="Add folder to watch"
                        >
                            <Plus size={14} className="text-[#808080] group-hover:text-white transition-colors" />
                        </button>
                    </div>
                    <div className="space-y-0.5">
                        {watchedFolders.length === 0 ? (
                            <div className="text-xs text-[#606060] px-3 py-3 text-center italic">
                                No watched folders
                            </div>
                        ) : (
                            watchedFolders.map((folder) => (
                                <button
                                    key={folder.id}
                                    onClick={() => setSelectedCollection(folder.id)}
                                    className={`sidebar-item w-full ${selectedCollection === folder.id ? 'active' : 'inactive'}`}
                                    title={folder.folderPath}
                                >
                                    <FolderOpen size={18} />
                                    <span className="truncate flex-1 text-left">{folder.name}</span>
                                    <span className="text-[10px] text-[#606060]">
                                        {/* Could show file count here */}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Tools section */}
            <div className="p-3 border-t border-[#404040] flex-shrink-0 space-y-1">
                <h3 className="text-[10px] font-bold text-[#808080] uppercase tracking-wider mb-2 px-3">
                    Tools
                </h3>
                <button
                    onClick={openDuplicatesModal}
                    className="sidebar-item inactive w-full"
                >
                    <Copy size={18} />
                    <span>Find Duplicates</span>
                </button>
            </div>

            {/* Bottom section - Settings */}
            <div className="p-3 border-t border-[#404040] flex-shrink-0">
                <button
                    onClick={openSettings}
                    className="sidebar-item w-full hover:bg-[#353535] hover:text-white transition-colors"
                >
                    <Settings size={18} />
                    <span>Settings & Tools</span>
                </button>
            </div>
        </div>
    );
}
