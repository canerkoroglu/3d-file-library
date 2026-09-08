import { useState } from 'react';
import { Box, Files, FileText, FileX, Check } from 'lucide-react';
import type { ModelWithTags } from '../types';
import { useStore } from '../store/store';
import { formatDimensions, formatFileSize, formatTriangles, thumbnailUrl } from '../lib/format';

interface ModelCardProps {
    model: ModelWithTags;
    viewMode: 'grid' | 'list';
    /** Position in the loaded list, used for shift-click ranges. */
    index: number;
    selected: boolean;
    /** True when any selection exists or selection mode is on: clicks toggle instead of opening. */
    selectionActive: boolean;
}

export default function ModelCard({ model, viewMode, index, selected, selectionActive }: ModelCardProps) {
    const { openViewer, toggleModelSelection, selectRangeTo } = useStore();
    const [imgError, setImgError] = useState(false);
    const src = thumbnailUrl(model) ?? undefined;
    const showImage = Boolean(src) && !imgError;
    const missing = Boolean(model.missingSince);
    const missingTitle = missing ? `File not found since ${new Date(model.missingSince!).toLocaleString()}` : undefined;

    const icon = model.fileType === '3mf'
        ? <Files size={48} className="text-text-secondary" strokeWidth={1.5} />
        : <Box size={48} className="text-text-secondary" strokeWidth={1.5} />;

    const handleClick = (e: React.MouseEvent) => {
        if (e.shiftKey) {
            e.preventDefault();
            selectRangeTo(index);
            return;
        }
        if (e.metaKey || e.ctrlKey || selectionActive) {
            toggleModelSelection(model.id, index);
            return;
        }
        openViewer(model);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (selectionActive) toggleModelSelection(model.id, index);
            else openViewer(model);
        }
    };

    const handleCheckbox = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (e.shiftKey) selectRangeTo(index);
        else toggleModelSelection(model.id, index);
    };

    const checkbox = (
        <button
            onClick={handleCheckbox}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                selected
                    ? 'bg-accent-blue border-accent-blue text-white opacity-100'
                    : `bg-black/40 border-white/70 text-transparent hover:border-white ${selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
            }`}
            title={selected ? 'Deselect' : 'Select'}
            aria-label={selected ? 'Deselect' : 'Select'}
            aria-pressed={selected}
            tabIndex={-1}
        >
            <Check size={12} strokeWidth={3} />
        </button>
    );

    const selectedRing = selected ? 'ring-2 ring-accent-blue border-accent-blue' : '';

    if (viewMode === 'list') {
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                aria-selected={selected}
                className={`model-card group w-full h-full p-3 flex items-center gap-4 hover:border-accent-blue ${missing ? 'opacity-60' : ''} ${selectedRing}`}
                title={missingTitle}
            >
                <div className="flex-shrink-0">{checkbox}</div>
                <div className="w-14 h-14 bg-primary-bg rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {showImage ? (
                        <img src={src} alt={model.filename} className="w-full h-full object-cover" onError={() => setImgError(true)} loading="lazy" />
                    ) : icon}
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="font-medium text-sm truncate">{model.displayName || model.filename}</div>
                    <div className="text-xs text-text-secondary truncate mt-0.5">{model.folderPath}</div>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary flex-shrink-0 tabular-nums">
                    {missing && (
                        <span className="flex items-center gap-1 text-red-400 font-medium">
                            <FileX size={12} /> Missing
                        </span>
                    )}
                    {model.bbox && <span className="hidden lg:inline">{formatDimensions(model.bbox)}</span>}
                    {model.triangleCount !== undefined && <span className="hidden xl:inline">{formatTriangles(model.triangleCount)}</span>}
                    <span>{formatFileSize(model.fileSize)}</span>
                    <span className="uppercase font-semibold w-8">{model.fileType}</span>
                </div>
            </div>
        );
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            aria-selected={selected}
            className={`model-card group flex flex-col h-full ${missing ? 'opacity-60' : ''} ${selectedRing}`}
            title={missingTitle}
        >
            <div className="thumbnail relative">
                {missing && (
                    <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-red-500/85 backdrop-blur-sm rounded text-[10px] font-bold text-white uppercase flex items-center gap-1">
                        <FileX size={10} /> Missing
                    </div>
                )}
                <div className="absolute top-2 right-2 z-10">{checkbox}</div>

                {showImage ? (
                    <img src={src} alt={model.filename} className="w-full h-full object-cover" onError={() => setImgError(true)} loading="lazy" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">{icon}</div>
                )}

                <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] font-bold text-white uppercase">
                    {model.fileType}
                </div>

                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                    {model.hasReadme && (
                        <div className="p-1 bg-black/60 backdrop-blur-sm rounded text-white" title="Has README">
                            <FileText size={10} />
                        </div>
                    )}
                    {model.sourceMetadata?.source && (
                        <div className="px-2 py-0.5 bg-blue-500/80 backdrop-blur-sm rounded text-[10px] font-semibold text-white">
                            {model.sourceMetadata.source}
                        </div>
                    )}
                </div>
            </div>

            <div className="p-3 flex-1 flex flex-col min-h-0">
                <div className="font-medium text-sm truncate mb-1 text-left" title={model.filename}>
                    {model.displayName || model.filename}
                </div>
                <div className="text-xs text-text-secondary flex items-center justify-between gap-2 tabular-nums">
                    <span className="truncate">{model.bbox ? formatDimensions(model.bbox) : formatFileSize(model.fileSize)}</span>
                    {model.tags.length > 0 && (
                        <span className="flex items-center gap-1 flex-shrink-0">
                            {model.tags.slice(0, 3).map((tag) => (
                                <span key={tag.id} className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} title={tag.name} />
                            ))}
                            {model.tags.length > 3 && <span className="text-[10px]">+{model.tags.length - 3}</span>}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
