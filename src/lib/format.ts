import type { BoundingBox, Model } from '../types';

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTriangles(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M tris`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 100_000 ? 0 : 1)}k tris`;
    return `${count} tris`;
}

export function formatDimensions(bbox: BoundingBox): string {
    const f = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));
    return `${f(bbox.x)} × ${f(bbox.y)} × ${f(bbox.z)} mm`;
}

export function formatVolume(volumeMm3: number): string {
    const cm3 = volumeMm3 / 1000;
    return cm3 >= 100 ? `${cm3.toFixed(0)} cm³` : `${cm3.toFixed(2)} cm³`;
}

/** Builds the media:// URL for a model thumbnail, cache-busted by its update time. */
export function thumbnailUrl(model: Pick<Model, 'thumbnailPath' | 'thumbnailUpdatedAt' | 'createdAt'>): string | null {
    if (!model.thumbnailPath) return null;
    const normalized = model.thumbnailPath.replace(/\\/g, '/');
    const version = model.thumbnailUpdatedAt ?? model.createdAt;
    return `media:///${encodeURI(normalized).replace(/^\/+/, '')}?v=${encodeURIComponent(version)}`;
}
