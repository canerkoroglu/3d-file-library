import { describe, expect, it, vi } from 'vitest';
import path from 'path';

// zipImport pulls in the database, library and indexer modules; none are needed for the path helpers.
vi.mock('../electron/database', () => ({ getDatabase: () => { throw new Error('not used'); } }));
vi.mock('../electron/library', () => ({ fileTypeOf: () => null, importModel: () => null, notifyModelsUpdated: () => {} }));
vi.mock('../electron/indexer', () => ({ enqueueModel: () => {} }));

const { commonTopLevel, isJunkEntry, safeRelativePath } = await import('../electron/zipImport');

describe('zip entry safety', () => {
    it('rejects paths that escape the destination', () => {
        expect(safeRelativePath('../../etc/passwd')).toBeNull();
        expect(safeRelativePath('files/../../x.stl')).toBeNull();
        expect(safeRelativePath('/abs/x.stl')).toBeNull();
        expect(safeRelativePath('C:\\x.stl')).toBeNull();
        expect(safeRelativePath('')).toBeNull();
    });

    it('normalises ordinary entries', () => {
        expect(safeRelativePath('files/part.stl')).toBe(['files', 'part.stl'].join(path.sep));
        expect(safeRelativePath('files\\sub\\part.stl')).toBe(['files', 'sub', 'part.stl'].join(path.sep));
        expect(safeRelativePath('./part.stl')).toBe(['.', 'part.stl'].join(path.sep));
    });

    it('skips archive junk', () => {
        expect(isJunkEntry('__MACOSX/files/._part.stl')).toBe(true);
        expect(isJunkEntry('files/.DS_Store')).toBe(true);
        expect(isJunkEntry('files/part.stl')).toBe(false);
    });
});

describe('commonTopLevel', () => {
    it('finds a single wrapping directory', () => {
        expect(commonTopLevel(['thing-123/files/a.stl', 'thing-123/README.txt'])).toBe('thing-123');
    });

    it('returns null for flat archives or several top-level entries', () => {
        expect(commonTopLevel(['a.stl', 'b.stl'])).toBeNull();
        expect(commonTopLevel(['files/a.stl', 'images/a.png'])).toBeNull();
        expect(commonTopLevel(['thing/files/a.stl', 'README.txt'])).toBeNull();
    });
});
