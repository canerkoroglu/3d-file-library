import { useState } from 'react';
import { Box, Share2, Files } from 'lucide-react';
import type { ModelWithTags } from '../types';
import { useStore } from '../store/store';

interface ModelCardProps {
    model: ModelWithTags;
    viewMode: 'grid' | 'list';
}

export default function ModelCard({ model, viewMode }: ModelCardProps) {
    const { openViewer } = useStore();
    const [imgError, setImgError] = useState(false);

    const handleImageError = () => {
        console.error(`Failed to load thumbnail for ${model.filename} at path: ${model.thumbnailPath}`);
        setImgError(true);
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getFileIcon = () => {
        switch (model.fileType) {
            case '3mf':
                return <Files size={48} className="text-text-secondary" strokeWidth={1.5} />;
            default:
                return <Box size={48} className="text-text-secondary" strokeWidth={1.5} />;
        }
    };

    if (viewMode === 'list') {
        return (
            <button
                onClick={() => openViewer(model)}
                className="model-card p-4 flex items-center gap-4 hover:border-accent-blue"
            >
                <div className="w-14 h-14 bg-primary-bg rounded-lg flex items-center justify-center flex-shrink-0">
                    {model.thumbnailPath && !imgError ? (
                        <img
                            src={`media:///${model.thumbnailPath ? model.thumbnailPath.replace(/\\/g, '/') : ''}`}
                            alt={model.filename}
                            className="w-full h-full object-cover rounded-lg"
                            onError={handleImageError}
                        />
                    ) : (
                        getFileIcon()
                    )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="font-medium text-sm truncate">{model.displayName || model.filename}</div>
                    <div className="text-xs text-text-secondary truncate mt-0.5">{model.filepath}</div>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary flex-shrink-0">
                    <span>{formatFileSize(model.fileSize)}</span>
                    <span className="uppercase font-semibold">{model.fileType}</span>
                </div>
            </button>
        );
    }

    return (
        <button
            onClick={() => openViewer(model)}
            className="model-card group flex flex-col"
        >
            {/* Thumbnail */}
            <div className="thumbnail relative">
                {model.thumbnailPath && !imgError ? (
                    <img
                        key={`${model.id}-${model.createdAt}`}
                        src={`media:///${model.thumbnailPath ? model.thumbnailPath.replace(/\\/g, '/') : ''}?t=${new Date(model.createdAt).getTime()}`}
                        alt={model.filename}
                        className="w-full h-full object-cover"
                        onError={handleImageError}
                    // onLoad={() => console.log(`Thumbnail loaded for ${model.filename}`)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        {getFileIcon()}
                    </div>
                )}

                {/* Selection checkbox removed per user request */}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-4">
                    <div className="flex gap-2">
                        <div className="px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-lg flex items-center gap-1.5">
                            <Share2 size={14} className="text-white" />
                            <span className="text-xs text-white font-medium">View</span>
                        </div>
                    </div>
                </div>

                {/* Tag rendering removed per user request */}

                {/* File type badge */}
                <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] font-bold text-white uppercase">
                    {model.fileType}
                </div>

                {/* Source badge */}
                {model.sourceMetadata?.source && (
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-blue-500/80 backdrop-blur-sm rounded text-[10px] font-semibold text-white flex items-center gap-1">
                        <span>{model.sourceMetadata.source}</span>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-3 flex-1 flex flex-col">
                <div className="font-medium text-sm truncate mb-1.5 text-left">
                    {model.displayName || model.filename}
                </div>
                <div className="text-xs text-text-secondary flex items-center justify-between">
                    <span>{formatFileSize(model.fileSize)}</span>
                    {model.tags && model.tags.length > 1 && (
                        <span className="text-[10px] bg-primary-hover px-1.5 py-0.5 rounded">
                            +{model.tags.length - 1} tag{model.tags.length - 1 > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}
