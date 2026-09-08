import fs from 'fs';
import path from 'path';
import type { SidecarInfo } from './types';

const README_MAX_BYTES = 32 * 1024;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const README_PATTERNS = [/^readme(\..+)?$/i, /^read ?me\.txt$/i, /^description\.(txt|md)$/i];
const LICENSE_PATTERNS = [/^license(\..+)?$/i, /^licence(\..+)?$/i];
const NUL_RE = new RegExp(String.fromCharCode(0), 'g');

const LICENSE_HINTS: Array<[RegExp, string]> = [
    [/CC[\s-]?BY[\s-]?NC[\s-]?SA/i, 'CC BY-NC-SA 4.0'],
    [/CC[\s-]?BY[\s-]?NC[\s-]?ND/i, 'CC BY-NC-ND 4.0'],
    [/CC[\s-]?BY[\s-]?NC/i, 'CC BY-NC 4.0'],
    [/CC[\s-]?BY[\s-]?SA/i, 'CC BY-SA 4.0'],
    [/CC[\s-]?BY[\s-]?ND/i, 'CC BY-ND 4.0'],
    [/CC[\s-]?BY\b/i, 'CC BY 4.0'],
    [/\bCC0\b|public domain/i, 'CC0 (Public Domain)'],
    [/GNU General Public License|\bGPL\b/i, 'GPL'],
    [/MIT License/i, 'MIT'],
];

/** Detects a Creative Commons or common OSS license from free text. */
export function detectLicense(text: string | null): string | null {
    if (!text) return null;
    for (const [pattern, name] of LICENSE_HINTS) {
        if (pattern.test(text)) return name;
    }
    return null;
}

async function readText(filepath: string): Promise<string | null> {
    try {
        const fd = await fs.promises.open(filepath, 'r');
        try {
            const buffer = Buffer.alloc(README_MAX_BYTES);
            const { bytesRead } = await fd.read(buffer, 0, README_MAX_BYTES, 0);
            const text = buffer.subarray(0, bytesRead).toString('utf8').replace(NUL_RE, '').trim();
            return text || null;
        } finally {
            await fd.close();
        }
    } catch {
        return null;
    }
}

async function listDir(dir: string): Promise<string[]> {
    try {
        return await fs.promises.readdir(dir);
    } catch {
        return [];
    }
}

function stemOf(name: string): string {
    return path.basename(name, path.extname(name)).toLowerCase();
}

/**
 * Looks next to a model file for a README, a license, and preview images.
 * Handles the common Thingiverse / Printables layout where `files/` and `images/` are siblings.
 */
export async function findSidecars(filepath: string): Promise<SidecarInfo> {
    const dir = path.dirname(filepath);
    const stem = stemOf(filepath);
    const entries = await listDir(dir);

    const readmeName = entries.find((e) => README_PATTERNS.some((p) => p.test(e)));
    const licenseName = entries.find((e) => LICENSE_PATTERNS.some((p) => p.test(e)));

    const readme = readmeName ? await readText(path.join(dir, readmeName)) : null;
    const licenseText = licenseName ? await readText(path.join(dir, licenseName)) : null;
    const license = detectLicense(licenseText) ?? detectLicense(readme);

    const images = entries.filter((e) => IMAGE_EXTENSIONS.has(path.extname(e).toLowerCase()));
    const matching = images.find((e) => stemOf(e) === stem) ?? images.find((e) => stemOf(e).startsWith(stem));
    if (matching) {
        return { readme, license, imagePath: path.join(dir, matching), imageSource: 'sidecar' };
    }

    // Sibling images directory (Thingiverse zip layout).
    const parent = path.dirname(dir);
    for (const candidateDir of [path.join(dir, 'images'), path.join(parent, 'images')]) {
        const candidates = (await listDir(candidateDir)).filter((e) => IMAGE_EXTENSIONS.has(path.extname(e).toLowerCase()));
        const named = candidates.find((e) => stemOf(e).includes(stem));
        if (named) return { readme, license, imagePath: path.join(candidateDir, named), imageSource: 'sidecar' };
        if (candidates.length > 0) {
            return { readme, license, imagePath: path.join(candidateDir, candidates.sort()[0]), imageSource: 'folder' };
        }
    }

    if (images.length > 0) {
        return { readme, license, imagePath: path.join(dir, images.sort()[0]), imageSource: 'folder' };
    }

    return { readme, license, imagePath: null, imageSource: null };
}
