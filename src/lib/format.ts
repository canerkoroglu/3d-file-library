import type { BedSize, BoundingBox, Model } from '../types';

/** Formats stored in millimetres, so a bed-size comparison is meaningful. */
const MM_FILE_TYPES = new Set(['stl', '3mf', 'obj', 'step']);

/**
 * True when the model cannot fit the printer bed in any axis-aligned orientation: sort both the
 * model's dimensions and the bed's and require each model dimension to fit the matching bed one.
 * Only checked for millimetre formats (glTF/USDZ units are model-defined, so they're skipped).
 */
export function exceedsBed(model: Pick<Model, 'bbox' | 'fileType'>, bed: BedSize | null): boolean {
    if (!bed || !model.bbox || !MM_FILE_TYPES.has(model.fileType)) return false;
    const m = [model.bbox.x, model.bbox.y, model.bbox.z].sort((a, b) => a - b);
    const b = [bed.x, bed.y, bed.z].sort((a, b) => a - b);
    return m[0] > b[0] || m[1] > b[1] || m[2] > b[2];
}

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
