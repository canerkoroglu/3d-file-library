import fs from 'fs';
import path from 'path';
import type { SidecarInfo } from './types';

const README_MAX_BYTES = 32 * 1024;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const README_PATTERNS = [/^readme(\..+)?$/i, /^read ?me\.txt$/i, /^description\.(txt|md)$/i];
const LICENSE_PATTERNS = [/^license(\..+)?$/i, /^licence(\..+)?$/i];
/** Sub-folder names under which sharing sites and designers usually put the meshes; their parent holds the README. */
const FILES_SUBFOLDER = /^(files|models?|meshes|parts|stls?|3mfs?|objs?|print[ _-]?files|sources?)$/i;
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

const SOURCE_PATTERNS: Array<[RegExp, string]> = [
    [/https?:\/\/(?:www\.)?thingiverse\.com\/thing:\d+/i, 'Thingiverse'],
    [/https?:\/\/(?:www\.)?printables\.com\/(?:[a-z]{2}\/)?model\/[\w-]+/i, 'Printables'],
    [/https?:\/\/(?:www\.)?myminifactory\.com\/object\/[\w-]+/i, 'MyMiniFactory'],
    [/https?:\/\/(?:www\.)?cults3d\.com\/[\w-]+\/3d-model\/[\w-]+\/[\w-]+/i, 'Cults3D'],
    [/https?:\/\/(?:www\.)?thangs\.com\/[^\s)"'<>]+/i, 'Thangs'],
    [/https?:\/\/(?:www\.)?makerworld\.com\/[^\s)"'<>]*models\/\d+[^\s)"'<>]*/i, 'MakerWorld'],
];

/** Finds a link to the model's page on a known sharing site, e.g. in a Thingiverse README. */
export function detectSource(text: string | null): { site: string; url: string } | null {
    if (!text) return null;
    for (const [pattern, site] of SOURCE_PATTERNS) {
        const match = text.match(pattern);
        if (match) return { site, url: match[0].replace(/[.,;]+$/, '') };
    }
    return null;
}

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

    // A README next to the model wins; otherwise, for a "files/" style sub-folder, look one level up.
    const parent = path.dirname(dir);
    const parentEntries = FILES_SUBFOLDER.test(path.basename(dir)) ? await listDir(parent) : [];
    const locate = (patterns: RegExp[]): string | null => {
        const own = entries.find((e) => patterns.some((p) => p.test(e)));
        if (own) return path.join(dir, own);
        const above = parentEntries.find((e) => patterns.some((p) => p.test(e)));
        return above ? path.join(parent, above) : null;
    };

    const readmePath = locate(README_PATTERNS);
    const licensePath = locate(LICENSE_PATTERNS);
    const readme = readmePath ? await readText(readmePath) : null;
    const licenseText = licensePath ? await readText(licensePath) : null;
    const license = detectLicense(licenseText) ?? detectLicense(readme);
    const source = detectSource(readme);
    const sourceSite = source?.site ?? null;
    const sourceUrl = source?.url ?? null;

    const images = entries.filter((e) => IMAGE_EXTENSIONS.has(path.extname(e).toLowerCase()));
    const matching = images.find((e) => stemOf(e) === stem) ?? images.find((e) => stemOf(e).startsWith(stem));
    if (matching) {
        return { readme, license, sourceSite, sourceUrl, imagePath: path.join(dir, matching), imageSource: 'sidecar' };
    }

    // Sibling images directory (Thingiverse zip layout).
    for (const candidateDir of [path.join(dir, 'images'), path.join(parent, 'images')]) {
        const candidates = (await listDir(candidateDir)).filter((e) => IMAGE_EXTENSIONS.has(path.extname(e).toLowerCase()));
        const named = candidates.find((e) => stemOf(e).includes(stem));
        if (named) return { readme, license, sourceSite, sourceUrl, imagePath: path.join(candidateDir, named), imageSource: 'sidecar' };
        if (candidates.length > 0) {
            return { readme, license, sourceSite, sourceUrl, imagePath: path.join(candidateDir, candidates.sort()[0]), imageSource: 'folder' };
        }
    }

    if (images.length > 0) {
        return { readme, license, sourceSite, sourceUrl, imagePath: path.join(dir, images.sort()[0]), imageSource: 'folder' };
    }

    return { readme, license, sourceSite, sourceUrl, imagePath: null, imageSource: null };
}
