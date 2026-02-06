import { useEffect } from 'react';
import { useStore } from '../store/store';
import { X, Trash2, AlertTriangle, File } from 'lucide-react';
import { format } from 'date-fns';

const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const DuplicatesModal = () => {
    const {
        closeDuplicatesModal,
        duplicateGroups,
        wastedSpace,
        checkForDuplicates,
        deleteDuplicate,
        isLoading
    } = useStore();

    useEffect(() => {
        checkForDuplicates();
    }, [checkForDuplicates]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-primary-card w-full max-w-4xl h-[80vh] rounded-xl flex flex-col shadow-2xl border border-accent-gray">
                {/* Header */}
                <div className="h-16 border-b border-accent-gray flex items-center justify-between px-6 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="text-yellow-500" size={24} />
                        <div>
                            <h2 className="text-lg font-semibold text-text-primary">Duplicate Finder</h2>
                            {wastedSpace && (
                                <p className="text-xs text-text-secondary">
                                    Found {wastedSpace.groupCount} groups, wasting {formatSize(wastedSpace.totalWasted)} space
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={closeDuplicatesModal}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary-hover text-text-secondary hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                            <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
                            <p>Scanning for duplicates...</p>
                        </div>
                    ) : duplicateGroups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                            <div className="w-16 h-16 rounded-full bg-primary-bg flex items-center justify-center">
                                <File size={32} className="text-green-500" />
                            </div>
                            <h3 className="text-lg font-medium text-text-primary">No duplicates found</h3>
                            <p>Your library is clean and organized!</p>
                        </div>
                    ) : (
                        duplicateGroups.map((group, index) => (
                            <div key={group.hash} className="bg-primary-bg rounded-lg border border-accent-gray overflow-hidden">
                                <div className="bg-primary-hover px-4 py-2 border-b border-accent-gray flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono bg-primary-card px-2 py-0.5 rounded text-text-secondary">
                                            Group #{index + 1}
                                        </span>
                                        <span className="text-xs text-text-secondary">
                                            Size: {formatSize(group.models[0].fileSize)}
                                        </span>
                                    </div>
                                    <div className="text-xs text-yellow-500 font-medium">
                                        {group.models.length} duplicates
                                    </div>
                                </div>

                                <div className="divide-y divide-accent-gray">
                                    {group.models.map((model) => (
                                        <div key={model.id} className="p-4 flex items-center justify-between group hover:bg-primary-hover transition-colors">
                                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                                {model.thumbnailPath ? (
                                                    <img
                                                        src={`file://${model.thumbnailPath}`}
                                                        alt={model.filename}
                                                        className="w-10 h-10 rounded object-cover bg-primary-card"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded bg-primary-card flex items-center justify-center text-text-secondary">
                                                        <File size={16} />
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-sm font-medium text-text-primary truncate" title={model.filename}>
                                                        {model.filename}
                                                    </h4>
                                                    <div className="flex items-center gap-2 text-xs text-text-secondary mt-0.5">
                                                        <span className="truncate" title={model.filepath}>
                                                            {model.filepath.replace(model.filename, '')}
                                                        </span>
                                                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-primary-card text-[10px]">
                                                            {model.fileType.toUpperCase()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 ml-4">
                                                <div className="text-right text-xs text-text-secondary">
                                                    {format(new Date(model.createdAt), 'MMM d, yyyy')}
                                                </div>
                                                <button
                                                    onClick={() => deleteDuplicate(model.id)}
                                                    className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/20 text-text-secondary hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Delete duplicate"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="h-16 border-t border-accent-gray flex items-center justify-between px-6 bg-primary-hover flex-shrink-0 rounded-b-xl text-sm">
                    <div className="text-text-secondary">
                        {duplicateGroups.length > 0 && (
                            <span>
                                Keep one file from each group to reclaim space.
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DuplicatesModal;
