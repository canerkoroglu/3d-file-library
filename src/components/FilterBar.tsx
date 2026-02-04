import { Search, Upload, Grid, List } from 'lucide-react';
import { useStore } from '../store/store';

export default function FilterBar() {
    const {
        searchQuery,
        setSearchQuery,
        viewMode,
        setViewMode,
        tags,
        selectedTags,
        toggleTag,
        importFiles,
        loadModels
    } = useStore();

    const handleSearch = (value: string) => {
        setSearchQuery(value);
        // Debounce would be better in production
        setTimeout(() => loadModels(), 300);
    };

    return (
        <div className="bg-[#2d2d2d] border-b border-[#404040] px-4 py-3 space-y-3 flex-shrink-0">
            {/* Top row: Search and actions */}
            <div className="flex items-center gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#808080] pointer-events-none"
                    />
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="input pl-9 h-9 text-sm"
                    />
                </div>

                {/* Actions */}
                <button
                    onClick={importFiles}
                    className="btn btn-primary h-9 text-sm px-4"
                >
                    <Upload size={16} />
                    <span>Import</span>
                </button>

                {/* View mode toggle */}
                <div className="flex items-center bg-[#1a1a1a] rounded-lg p-1 border border-[#404040]">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded transition-all duration-200 ${viewMode === 'grid'
                                ? 'bg-[#3b82f6] text-white shadow-sm'
                                : 'text-[#808080] hover:text-white hover:bg-[#353535]'
                            }`}
                        title="Grid view"
                    >
                        <Grid size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded transition-all duration-200 ${viewMode === 'list'
                                ? 'bg-[#3b82f6] text-white shadow-sm'
                                : 'text-[#808080] hover:text-white hover:bg-[#353535]'
                            }`}
                        title="List view"
                    >
                        <List size={16} />
                    </button>
                </div>
            </div>

            {/* Tag filters */}
            {tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[#808080] font-bold uppercase tracking-wider flex-shrink-0">
                        Filter:
                    </span>
                    {tags.map((tag) => {
                        const isSelected = selectedTags.includes(tag.id);
                        return (
                            <button
                                key={tag.id}
                                onClick={() => toggleTag(tag.id)}
                                className={`tag ${isSelected ? 'active' : ''}`}
                                style={{
                                    backgroundColor: tag.color,
                                    color: '#000',
                                    opacity: isSelected ? 1 : 0.6,
                                }}
                            >
                                {tag.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
