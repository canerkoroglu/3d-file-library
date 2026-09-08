import { useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2, FolderX, SearchX } from 'lucide-react';
import { useStore } from '../store/store';
import ModelCard from './ModelCard';

const GRID_MIN_CARD_WIDTH = 200;
const GRID_GAP = 16;
const GRID_INFO_HEIGHT = 66; // text block below the square thumbnail
const LIST_ROW_HEIGHT = 80;
const PADDING = 20;

export default function ModelGrid() {
    const { models, totalModels, isLoading, isLoadingMore, loadMoreModels, viewMode, searchQuery, selectedTags, selectedCollection } = useStore();
    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        if (!scrollEl) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) setWidth(entry.contentRect.width);
        });
        observer.observe(scrollEl);
        setWidth(scrollEl.clientWidth);
        return () => observer.disconnect();
    }, [scrollEl]);

    const innerWidth = Math.max(0, width - PADDING * 2);
    const columns = viewMode === 'grid'
        ? Math.max(1, Math.floor((innerWidth + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP)))
        : 1;
    const cardWidth = viewMode === 'grid' ? (innerWidth - GRID_GAP * (columns - 1)) / columns : innerWidth;
    const rowHeight = viewMode === 'grid' ? cardWidth + GRID_INFO_HEIGHT + GRID_GAP : LIST_ROW_HEIGHT;
    const rowCount = Math.ceil(models.length / columns);

    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollEl,
        estimateSize: () => rowHeight,
        overscan: 3,
    });

    // Row height depends on the container width, so re-measure whenever the layout changes.
    useEffect(() => {
        virtualizer.measure();
    }, [rowHeight, columns, virtualizer]);

    // Fetch the next page once the user scrolls near the last loaded row.
    const virtualItems = virtualizer.getVirtualItems();
    const lastVisibleRow = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;
    useEffect(() => {
        if (models.length < totalModels && lastVisibleRow >= rowCount - 3) void loadMoreModels();
    }, [lastVisibleRow, rowCount, models.length, totalModels, loadMoreModels]);

    if (isLoading && models.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-primary-bg">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="spinner w-8 h-8" />
                    <div className="text-text-secondary text-sm">Loading models…</div>
                </div>
            </div>
        );
    }

    if (models.length === 0) {
        const isFiltered = Boolean(searchQuery.trim()) || selectedTags.length > 0 || selectedCollection !== null;
        return (
            <div className="flex-1 flex items-center justify-center bg-primary-bg">
                <div className="flex flex-col items-center gap-4 max-w-md text-center">
                    <div className="w-20 h-20 bg-primary-card rounded-2xl flex items-center justify-center">
                        {isFiltered ? <SearchX size={40} className="text-text-secondary" /> : <FolderX size={40} className="text-text-secondary" />}
                    </div>
                    <div>
                        <div className="text-text-primary font-medium mb-2">{isFiltered ? 'No matches' : 'No models yet'}</div>
                        <div className="text-sm text-text-secondary">
                            {isFiltered
                                ? 'Try fewer words, or clear the tag and collection filters.'
                                : 'Add a watched folder from the sidebar to start building your library.'}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div ref={setScrollEl} className="flex-1 overflow-y-auto bg-primary-bg" style={{ padding: PADDING }}>
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                {virtualItems.map((row) => {
                    const start = row.index * columns;
                    const items = models.slice(start, start + columns);
                    return (
                        <div
                            key={row.key}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: rowHeight,
                                transform: `translateY(${row.start}px)`,
                                display: viewMode === 'grid' ? 'grid' : 'block',
                                gridTemplateColumns: viewMode === 'grid' ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
                                gap: GRID_GAP,
                                paddingBottom: viewMode === 'grid' ? GRID_GAP : 8,
                            }}
                        >
                            {items.map((model) => (
                                <ModelCard key={model.id} model={model} viewMode={viewMode} />
                            ))}
                        </div>
                    );
                })}
            </div>
            {(isLoadingMore || models.length < totalModels) && (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-text-secondary">
                    {isLoadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                    {isLoadingMore ? 'Loading more…' : `${models.length.toLocaleString()} of ${totalModels.toLocaleString()} loaded`}
                </div>
            )}
        </div>
    );
}
