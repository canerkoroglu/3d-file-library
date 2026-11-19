/** Recursive listing of supported model files in a watched folder. */
import fs from 'fs';
import path from 'path';
import { fileTypeOf } from './library/core';

/**
 * Recursively lists supported model files without blocking the event loop. Symlinks are followed
 * (as chokidar does for later changes); files keep their symlink path. Each folder is visited once
 * by its real path, so link loops and links back to a parent terminate. Broken links are skipped.
 */
export async function scanDirectory(root: string): Promise<string[]> {
    const found: string[] = [];
    const visited = new Set<string>();
    const stack = [root];

    while (stack.length > 0) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[];
        try {
            const real = await fs.promises.realpath(dir);
            if (visited.has(real)) continue;
            visited.add(real);
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch (error) {
            console.warn(`[Sync] Cannot read ${dir}:`, error);
            continue;
        }
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            let isDirectory = entry.isDirectory();
            let isFile = entry.isFile();
            if (entry.isSymbolicLink()) {
                try {
                    const target = await fs.promises.stat(full);
                    isDirectory = target.isDirectory();
                    isFile = target.isFile();
                } catch {
                    continue; // broken link
                }
            }
            if (isDirectory) stack.push(full);
            else if (isFile && fileTypeOf(full)) found.push(full);
        }
    }

    return found;
}
