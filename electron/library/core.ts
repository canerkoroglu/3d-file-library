/** Shared events, supported file types and thumbnail ranking. */
import path from 'path';
import { EventEmitter } from 'events';
import type { AppNotice, FileType, ThumbnailSource } from '../../src/types';

export const SUPPORTED_EXTENSIONS = ['.stl', '.3mf', '.obj', '.glb', '.gltf', '.usdz', '.step', '.stp'];

/** Higher wins: a weaker thumbnail never replaces a stronger one. */
export const THUMBNAIL_STRENGTH: Record<ThumbnailSource, number> = {
    capture: 5,
    embedded: 4,
    sidecar: 3,
    render: 2,
    folder: 1,
};

/** Emits 'models-updated' whenever library contents change, and 'notice' for user-facing messages. */
export const libraryEvents = new EventEmitter();

export function notifyModelsUpdated(): void {
    libraryEvents.emit('models-updated');
}

/** Sends a short notification to the user (rendered as a toast). Use sparingly. */
export function notifyUser(notice: AppNotice): void {
    libraryEvents.emit('notice', notice);
}

export function fileTypeOf(filepath: string): FileType | null {
    const ext = path.extname(filepath).toLowerCase();
    if (ext === '.stl') return 'stl';
    if (ext === '.3mf') return '3mf';
    if (ext === '.obj') return 'obj';
    if (ext === '.glb' || ext === '.gltf') return 'glb';
    if (ext === '.usdz') return 'usdz';
    if (ext === '.step' || ext === '.stp') return 'step';
    return null;
}
