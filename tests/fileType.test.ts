import { describe, expect, it } from 'vitest';
import { fileTypeOf, SUPPORTED_EXTENSIONS } from '../electron/library';

describe('fileTypeOf', () => {
    it('maps existing and newly supported extensions', () => {
        expect(fileTypeOf('/a/model.stl')).toBe('stl');
        expect(fileTypeOf('/a/model.3mf')).toBe('3mf');
        expect(fileTypeOf('/a/model.obj')).toBe('obj');
        expect(fileTypeOf('/a/model.glb')).toBe('glb');
        expect(fileTypeOf('/a/model.gltf')).toBe('glb');
        expect(fileTypeOf('/a/model.usdz')).toBe('usdz');
    });

    it('is case-insensitive', () => {
        expect(fileTypeOf('/a/MODEL.GLB')).toBe('glb');
        expect(fileTypeOf('/a/Scene.Usdz')).toBe('usdz');
    });

    it('returns null for unsupported extensions (STEP is not wired yet)', () => {
        expect(fileTypeOf('/a/part.step')).toBeNull();
        expect(fileTypeOf('/a/notes.txt')).toBeNull();
    });

    it('SUPPORTED_EXTENSIONS includes the new formats', () => {
        expect(SUPPORTED_EXTENSIONS).toEqual(expect.arrayContaining(['.glb', '.gltf', '.usdz']));
    });
});
