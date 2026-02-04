import { Trash2, Tag, X } from 'lucide-react';
import { useStore } from '../store/store';

export default function BulkActionsBar() {
    const { selectedModels, clearSelection, bulkDelete, bulkAddTag, tags } = useStore();
    const selectedCount = selectedModels.size;

    if (selectedCount === 0) return null;

    const handleBulkDelete = async () => {
        if (confirm(`Delete ${selectedCount} selected model${selectedCount > 1 ? 's' : ''}?`)) {
            await bulkDelete();
        }
    };

    const handleBulkAddTag = async (tagId: number) => {
        await bulkAddTag(tagId);
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#2d2d2d] border border-[#404040] rounded-lg shadow-2xl px-6 py-4 flex items-center gap-6 z-50 animate-slide-up">
            {/* Selection count */}
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-[#3b82f6] rounded flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{selectedCount}</span>
                </div>
                <span className="text-sm font-medium">
                    {selectedCount} selected
                </span>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-[#404040]" />

            {/* Actions */}
            <div className="flex items-center gap-2">
                {/* Add Tag dropdown */}
                <div className="relative group">
                    <button className="btn btn-secondary h-9 text-sm px-4">
                        <Tag size={16} />
                        <span>Add Tag</span>
                    </button>

                    {/* Dropdown */}
                    <div className="absolute bottom-full left-0 mb-2 bg-[#2d2d2d] border border-[#404040] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 min-w-[160px]">
                        <div className="p-2 space-y-1">
                            {tags.map(tag => (
                                <button
                                    key={tag.id}
                                    onClick={() => handleBulkAddTag(tag.id)}
                                    className="w-full text-left px-3 py-2 rounded hover:bg-[#353535] transition-colors flex items-center gap-2"
                                >
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: tag.color }}
                                    />
                                    <span className="text-sm">{tag.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Delete */}
                <button
                    onClick={handleBulkDelete}
                    className="btn btn-danger h-9 text-sm px-4"
                >
                    <Trash2 size={16} />
                    <span>Delete</span>
                </button>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-[#404040]" />

            {/* Clear selection */}
            <button
                onClick={clearSelection}
                className="btn btn-ghost h-9 w-9 p-0"
                title="Clear selection"
            >
                <X size={18} />
            </button>
        </div>
    );
}
