import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';

vi.mock('../electron/indexer', () => ({ enqueueModel: () => {} }));

const { initDatabase, closeDatabase, getDatabase } = await import('../electron/database');
const { importZipFiles, ZIP_LIMITS } = await import('../electron/zipImport');

const defaults = { ...ZIP_LIMITS };
let dir: string;
let library: string;
let collectionId: number;

async function writeZip(name: string, files: Record<string, string | Buffer>): Promise<string> {
    const zip = new JSZip();
    for (const [entry, content] of Object.entries(files)) zip.file(entry, content);
    const file = path.join(dir, name);
    fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    return file;
}

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meshvault-zip-'));
    library = path.join(dir, 'library');
    fs.mkdirSync(library);
    initDatabase(':memory:');
    collectionId = getDatabase()
        .prepare("INSERT INTO collections (name, type, folder_path) VALUES ('Library', 'watched', ?)")
        .run(library).lastInsertRowid as number;
});

afterEach(() => {
    Object.assign(ZIP_LIMITS, defaults);
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('importZipFiles', () => {
    it('extracts models and registers them', async () => {
        const zip = await writeZip('thing.zip', { 'thing/files/part.stl': 'solid a\nendsolid a\n', 'thing/README.txt': 'hello' });
        const [result] = await importZipFiles([zip], collectionId);
        expect(result.error).toBeUndefined();
        expect(result.extracted).toBe(2);
        expect(result.models).toBe(1);
        expect(fs.existsSync(path.join(library, 'thing', 'files', 'part.stl'))).toBe(true);
    });

    it('stops an archive that expands beyond the size limit', async () => {
        ZIP_LIMITS.maxTotalBytes = 1024;
        // Highly compressible: tiny on disk, larger than the limit once extracted.
        const zip = await writeZip('bomb.zip', { 'big.stl': Buffer.alloc(64 * 1024, 0x61) });
        const [result] = await importZipFiles([zip], collectionId);
        expect(result.error).toMatch(/expands to more than/);
        expect(result.models).toBe(0);
        expect(fs.existsSync(path.join(result.folder, 'big.stl'))).toBe(false);
    });

    it('rejects archives with too many entries', async () => {
        ZIP_LIMITS.maxEntries = 2;
        const zip = await writeZip('many.zip', { 'a.stl': 'a', 'b.stl': 'b', 'c.stl': 'c' });
        const [result] = await importZipFiles([zip], collectionId);
        expect(result.error).toMatch(/contains 3 files/);
    });
});
