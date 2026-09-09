import { useState } from 'react';
import { Folder, FolderOpen, FolderX, Plus, Settings, Inbox, Copy, X, RefreshCw, Edit2, Loader2, FileX, FileArchive, Sparkles } from 'lucide-react';
import { useStore } from '../store/store';
import { ConfirmDialog } from './ConfirmDialog';

export default function Sidebar() {
    const { collections, selectedCollection, setSelectedCollection, openDuplicatesModal, openSettings, openImportZip, indexProgress, aiProgress, cancelEnrichment, libraryStats, setSearchQuery, searchQuery, reportError, pushToast } = useStore();
    const missingCount = libraryStats?.missing ?? 0;
    const isShowingMissing = searchQuery.trim().toLowerCase() === 'is:missing';

    const watchedFolders = collections.filter(c => c.type === 'watched');
    const userCollections = collections.filter(c => c.type === 'collection');

    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [editingCollection, setEditingCollection] = useState<{ id: number, name: string } | null>(null);

    // Confirmation Dialog State
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        action: () => Promise<void>;
    }>({
        isOpen: false,
        title: '',
        message: '',
        action: async () => { }
    });

    const closeConfirmDialog = () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;
        try {
            await window.electronAPI.createCollection(newCollectionName);
            // Reload collections
            const newCollections = await window.electronAPI.getCollections();
            useStore.getState().setCollections(newCollections);
            setNewCollectionName('');
            setIsCreatingCollection(false);
        } catch (error) {
            reportError('Could not create the collection', error);
        }
    };

    const handleRenameCollection = async (id: number, newName: string) => {
        if (!newName.trim() || newName === editingCollection?.name) {
            setEditingCollection(null);
            return;
        }

        try {
            await window.electronAPI.renameCollection(id, newName);
            const newCollections = await window.electronAPI.getCollections();
            useStore.getState().setCollections(newCollections);
        } catch (error) {
            reportError('Could not rename the collection', error);
        } finally {
            setEditingCollection(null);
        }
    };

    const handleDeleteCollection = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();

        setConfirmDialog({
            isOpen: true,
            title: 'Delete Collection',
            message: 'Are you sure you want to delete this collection? Models inside will not be deleted.',
            action: async () => {
                try {
                    await window.electronAPI.deleteCollection(id);
                    const newCollections = await window.electronAPI.getCollections();
                    useStore.getState().setCollections(newCollections);
                    if (selectedCollection === id) setSelectedCollection(null);
                } catch (error) {
                    reportError('Could not delete the collection', error);
                }
                closeConfirmDialog();
            }
        });
    };

    const handleAddWatchedFolder = async () => {
        try {
            await window.electronAPI.addWatchedFolder('');
            // Reload collections
            const newCollections = await window.electronAPI.getCollections();
            useStore.getState().setCollections(newCollections);
        } catch (error) {
            // Cancelling the dialog is not an error.
            if (!(error instanceof Error && error.message.includes('No folder selected'))) {
                reportError('Could not add the folder', error);
            }
        }
    };

    const handleRefreshFolders = async () => {
        try {
            await window.electronAPI.refreshWatchedFolders();
            pushToast({ kind: 'success', title: 'Watched folders re-synced' });
        } catch (error) {
            reportError('Could not refresh the watched folders', error);
        }
    };

    const handleRemoveWatchedFolder = async (folderId: number, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent selecting the folder when clicking delete

        setConfirmDialog({
            isOpen: true,
            title: 'Remove Watch Folder',
            message: 'Are you sure you want to stop watching this folder? The models will be removed from the library, but the original files on your computer will remain.',
            action: async () => {
                try {
                    await window.electronAPI.removeWatchedFolder(folderId);

                    // Force reload of models to clear them from view
                    await useStore.getState().loadModels();

                    // Reload collections
                    const newCollections = await window.electronAPI.getCollections();
                    useStore.getState().setCollections(newCollections);
                    // If we deleted the selected folder, reset selection
                    if (selectedCollection === folderId) {
                        setSelectedCollection(null);
                    }
                } catch (error) {
                    reportError('Could not remove the watched folder', error);
                }
                closeConfirmDialog();
            }
        });
    };

    return (
        <div className="w-60 bg-primary-card border-r border-accent-gray flex flex-col flex-shrink-0">
            <ConfirmDialog
                isOpen={confirmDialog.isOpen}
                title={confirmDialog.title}
                message={confirmDialog.message}
                onConfirm={confirmDialog.action}
                onCancel={closeConfirmDialog}
            />
            {/* Collections section */}
            <div className="flex-1 overflow-y-auto p-3 space-y-6">
                {/* All Models / Inbox */}
                <div>
                    <div className="flex items-center justify-between mb-2 px-3">
                        <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                            Collections
                        </h3>
                        <button
                            onClick={() => setIsCreatingCollection(true)}
                            className="p-1.5 hover:bg-primary-hover rounded-md transition-colors group"
                            title="Create Collection"
                        >
                            <Plus size={14} className="text-text-secondary group-hover:text-text-primary transition-colors" />
                        </button>
                    </div>

                    <div className="space-y-0.5">
                        <button
                            onClick={() => setSelectedCollection(null)}
                            className={`sidebar-item w-full ${selectedCollection === null ? 'active' : 'inactive'}`}
                        >
                            <Inbox size={18} />
                            <span>All Models</span>
                        </button>

                        {/* Creation Input */}
                        {isCreatingCollection && (
                            <div className="px-2 py-1">
                                <input
                                    autoFocus
                                    type="text"
                                    value={newCollectionName}
                                    onChange={(e) => setNewCollectionName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateCollection();
                                        if (e.key === 'Escape') {
                                            setIsCreatingCollection(false);
                                            setNewCollectionName('');
                                        }
                                    }}
                                    onBlur={() => {
                                        if (!newCollectionName.trim()) {
                                            setIsCreatingCollection(false);
                                            setNewCollectionName('');
                                        }
                                    }}
                                    placeholder="Collection name..."
                                    className="w-full bg-primary-bg text-text-primary text-sm px-2 py-1.5 rounded border border-accent-blue focus:outline-none"
                                />
                            </div>
                        )}

                        {userCollections.map((collection) => (
                            <div
                                key={collection.id}
                                className={`sidebar-item w-full group ${selectedCollection === collection.id ? 'active' : 'inactive'}`}
                                onClick={() => setSelectedCollection(collection.id)}
                            >
                                <Folder size={18} />
                                {editingCollection?.id === collection.id ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={editingCollection.name}
                                        onChange={(e) => setEditingCollection({ ...editingCollection, name: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenameCollection(collection.id, editingCollection.name);
                                            if (e.key === 'Escape') setEditingCollection(null);
                                        }}
                                        onBlur={() => handleRenameCollection(collection.id, editingCollection.name)}
                                        className="flex-1 bg-primary-bg text-text-primary text-sm px-1 rounded border border-accent-blue focus:outline-none min-w-0"
                                    />
                                ) : (
                                    <>
                                        <span className="truncate flex-1 text-left" onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            setEditingCollection({ id: collection.id, name: collection.name });
                                        }}>
                                            {collection.name}
                                        </span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingCollection({ id: collection.id, name: collection.name });
                                                }}
                                                className="p-1 hover:bg-primary-hover rounded-md transition-colors"
                                                title="Rename"
                                            >
                                                <Edit2 size={12} className="text-text-secondary hover:text-text-primary" />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteCollection(collection.id, e)}
                                                className="p-1 hover:bg-red-500/20 rounded-md transition-colors"
                                                title="Delete"
                                            >
                                                <X size={12} className="text-text-secondary hover:text-red-400" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Watched folders section */}
                <div>
                    <div className="flex items-center justify-between mb-2 px-3">
                        <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                            Watched Folders
                        </h3>
                        <div className="flex gap-1">
                            <button
                                onClick={handleRefreshFolders}
                                className="p-1.5 hover:bg-primary-hover rounded-md transition-colors group"
                                title="Refresh all watched folders"
                            >
                                <RefreshCw size={14} className="text-text-secondary group-hover:text-text-primary transition-colors" />
                            </button>
                            <button
                                onClick={handleAddWatchedFolder}
                                className="p-1.5 hover:bg-primary-hover rounded-md transition-colors group"
                                title="Add folder to watch"
                            >
                                <Plus size={14} className="text-text-secondary group-hover:text-text-primary transition-colors" />
                            </button>
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        {watchedFolders.length === 0 ? (
                            <div className="text-xs text-text-secondary px-3 py-3 text-center italic">
                                No watched folders
                            </div>
                        ) : (
                            watchedFolders.map((folder) => (
                                <div
                                    key={folder.id}
                                    onClick={() => setSelectedCollection(folder.id)}
                                    className={`sidebar-item w-full group cursor-pointer ${selectedCollection === folder.id ? 'active' : 'inactive'}`}
                                    title={folder.isOnline === false ? `${folder.folderPath} (not available: drive disconnected or folder moved)` : folder.folderPath}
                                >
                                    {folder.isOnline === false ? <FolderX size={18} className="text-red-400" /> : <FolderOpen size={18} />}
                                    <span className={`truncate flex-1 text-left ${folder.isOnline === false ? 'text-text-secondary' : ''}`}>{folder.name}</span>
                                    <button
                                        onClick={(e) => handleRemoveWatchedFolder(folder.id, e)}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                                        title="Remove watched folder"
                                    >
                                        <X size={14} className="text-red-400" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Tools section */}
            <div className="p-3 border-t border-accent-gray flex-shrink-0 space-y-1">
                <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2 px-3">
                    Tools
                </h3>
                <button
                    onClick={() => openImportZip()}
                    className="sidebar-item inactive w-full"
                    title="Extract downloaded archives into a watched folder"
                >
                    <FileArchive size={18} />
                    <span>Import ZIP…</span>
                </button>
                <button
                    onClick={openDuplicatesModal}
                    className="sidebar-item inactive w-full"
                >
                    <Copy size={18} />
                    <span>Find Duplicates</span>
                </button>
                {missingCount > 0 && (
                    <button
                        onClick={() => setSearchQuery(isShowingMissing ? '' : 'is:missing')}
                        className={`sidebar-item w-full ${isShowingMissing ? 'active' : 'inactive'}`}
                        title="Files that cannot be found on disk. Their tags and notes are kept until you forget them in Settings."
                    >
                        <FileX size={18} className="text-red-400" />
                        <span className="flex-1 text-left">Missing Files</span>
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-semibold tabular-nums">{missingCount}</span>
                    </button>
                )}
            </div>

            {/* Indexing status */}
            {indexProgress?.isRunning && (
                <div className="px-4 py-2 border-t border-accent-gray flex-shrink-0">
                    <div className="flex items-center justify-between text-[11px] text-text-secondary mb-1">
                        <span className="flex items-center gap-1.5">
                            <Loader2 size={11} className="animate-spin" /> {indexProgress.total > 0 ? 'Indexing' : 'Rendering previews'}
                        </span>
                        <span className="tabular-nums">
                            {indexProgress.total > 0
                                ? `${indexProgress.completed + indexProgress.failed} / ${indexProgress.total}`
                                : `${indexProgress.thumbnailsQueued} left`}
                        </span>
                    </div>
                    {indexProgress.total > 0 && (
                        <div className="h-1 bg-primary-bg rounded overflow-hidden">
                            <div
                                className="h-full bg-accent-blue transition-all duration-300"
                                style={{ width: `${((indexProgress.completed + indexProgress.failed) / indexProgress.total) * 100}%` }}
                            />
                        </div>
                    )}
                    {indexProgress.total > 0 && indexProgress.thumbnailsQueued > 0 && (
                        <div className="text-[10px] text-text-secondary mt-1">{indexProgress.thumbnailsQueued} previews to render</div>
                    )}
                </div>
            )}

            {/* AI analysis status */}
            {aiProgress?.isRunning && (
                <div className="px-4 py-2 border-t border-accent-gray flex-shrink-0" data-testid="ai-progress">
                    <div className="flex items-center justify-between text-[11px] text-text-secondary mb-1">
                        <span className="flex items-center gap-1.5">
                            <Sparkles size={11} className="text-accent-blue" /> AI analysis
                        </span>
                        <span className="flex items-center gap-2 tabular-nums">
                            {aiProgress.completed + aiProgress.failed} / {aiProgress.total}
                            <button onClick={() => void cancelEnrichment()} className="hover:text-text-primary" title="Stop">
                                <X size={11} />
                            </button>
                        </span>
                    </div>
                    <div className="h-1 bg-primary-bg rounded overflow-hidden">
                        <div
                            className="h-full bg-accent-blue transition-all duration-300"
                            style={{ width: `${aiProgress.total ? ((aiProgress.completed + aiProgress.failed) / aiProgress.total) * 100 : 0}%` }}
                        />
                    </div>
                    {aiProgress.current && <div className="text-[10px] text-text-secondary mt-1 truncate" title={aiProgress.current}>{aiProgress.current}</div>}
                </div>
            )}

            {/* Bottom section - Settings */}
            <div className="p-3 border-t border-accent-gray flex-shrink-0">
                <button
                    onClick={openSettings}
                    className="sidebar-item w-full hover:bg-primary-hover hover:text-text-primary transition-colors"
                >
                    <Settings size={18} />
                    <span>Settings & Tools</span>
                </button>
            </div>
        </div>
    );
}
