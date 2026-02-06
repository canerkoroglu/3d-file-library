import { Search, Grid, List } from 'lucide-react';
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
        /* importFiles removed */
        loadModels,
        sortBy,
        sortOrder,
        setSortBy,
        setSortOrder
    } = useStore();

    const handleSearch = (value: string) => {
        setSearchQuery(value);
        // Debounce would be better in production
        setTimeout(() => loadModels(), 300);
    };

    return (
        <div className="bg-primary-card border-b border-accent-gray px-4 py-3 space-y-3 flex-shrink-0">
            {/* Top row: Search and actions */}
            <div className="flex items-center gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                    />
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="input pl-9 h-9 text-sm"
                    />
                </div>

                {/* Import button removed per user request */}

                {/* Sort dropdown */}
                <select
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                        const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
                        setSortBy(newSortBy);
                        setSortOrder(newSortOrder);
                        setTimeout(() => loadModels(), 100);
                    }}
                    className="input h-9 text-sm px-3 cursor-pointer w-40"
                >
                    <option value="created-desc">Newest First</option>
                    <option value="created-asc">Oldest First</option>
                    <option value="name-asc">Name A-Z</option>
                    <option value="name-desc">Name Z-A</option>
                    <option value="size-desc">Largest First</option>
                    <option value="size-asc">Smallest First</option>
                    <option value="modified-desc">Recently Modified</option>
                    <option value="modified-asc">Least Modified</option>
                </select>

                {/* View mode toggle */}
                <div className="flex items-center bg-primary-bg rounded-lg p-1 border border-accent-gray">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded transition-all duration-200 ${viewMode === 'grid'
                            ? 'bg-accent-blue text-white shadow-sm'
                            : 'text-text-secondary hover:text-text-primary hover:bg-primary-hover'
                            }`}
                        title="Grid view"
                    >
                        <Grid size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded transition-all duration-200 ${viewMode === 'list'
                            ? 'bg-accent-blue text-white shadow-sm'
                            : 'text-text-secondary hover:text-text-primary hover:bg-primary-hover'
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
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider flex-shrink-0">
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
