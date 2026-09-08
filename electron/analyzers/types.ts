import type { BoundingBox, PrintMetadata, ThumbnailSource } from '../../src/types';

export interface GeometryStats {
    triangleCount: number;
    bbox: BoundingBox;
    /** Signed-volume sum in file units (mm for print files). Null when not computable. */
    volume: number | null;
}

export interface SidecarInfo {
    readme: string | null;
    /** Absolute path of an image file that can serve as a preview. */
    imagePath: string | null;
    /** How closely the image relates to this exact model. */
    imageSource: 'sidecar' | 'folder' | null;
    license: string | null;
}

export interface AnalysisJob {
    id: number;
    modelId: number;
    filepath: string;
    fileType: 'stl' | '3mf' | 'obj';
    thumbnailDir: string;
    /** Stored values, used to skip unchanged files. */
    knownMtimeMs: number | null;
    knownSize: number | null;
    hasHash: boolean;
    /** When true, the file is re-analysed even if unchanged. */
    force: boolean;
    /** Strength of the thumbnail the model already has (see THUMBNAIL_STRENGTH); weaker candidates are skipped. */
    existingThumbnailStrength: number;
}

export interface AnalysisResult {
    mtimeMs: number;
    size: number;
    unchanged: boolean;
    hash: string | null;
    geometry: GeometryStats | null;
    printMeta: PrintMetadata | null;
    readme: string | null;
    license: string | null;
    thumbnail: { path: string; source: ThumbnailSource } | null;
}

export type WorkerRequest =
    | { type: 'analyze'; job: AnalysisJob }
    | { type: 'shutdown' };

export type WorkerResponse =
    | { type: 'result'; id: number; modelId: number; ok: true; data: AnalysisResult }
    | { type: 'result'; id: number; modelId: number; ok: false; error: string }
    | { type: 'ready' };
