import path from 'path';
import fs from 'fs';

/**
 * Filesystem locations used by the main process and the indexer worker.
 * Kept free of Electron imports so it can be used from worker processes and tests.
 */
let userDataDir: string | null = null;

export function setUserDataDir(dir: string): void {
    userDataDir = dir;
    fs.mkdirSync(getThumbnailDir(), { recursive: true });
}

export function getUserDataDir(): string {
    if (!userDataDir) throw new Error('User data directory not configured');
    return userDataDir;
}

export function getDatabasePath(): string {
    return path.join(getUserDataDir(), 'modelist.db');
}

export function getThumbnailDir(): string {
    return path.join(getUserDataDir(), 'thumbnails');
}

export function getThumbnailPath(modelId: number): string {
    return path.join(getThumbnailDir(), `${modelId}.png`);
}

/** True when `candidate` lives inside `root` (after normalisation). */
export function isInsideDir(root: string, candidate: string): boolean {
    const rel = path.relative(path.resolve(root), path.resolve(candidate));
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
