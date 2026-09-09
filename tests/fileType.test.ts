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
        expect(fileTypeOf('/a/part.step')).toBe('step');
        expect(fileTypeOf('/a/part.stp')).toBe('step');
    });

    it('is case-insensitive', () => {
        expect(fileTypeOf('/a/MODEL.GLB')).toBe('glb');
        expect(fileTypeOf('/a/Scene.Usdz')).toBe('usdz');
    });

    it('returns null for unsupported extensions', () => {
        expect(fileTypeOf('/a/model.fbx')).toBeNull();
        expect(fileTypeOf('/a/notes.txt')).toBeNull();
    });

    it('SUPPORTED_EXTENSIONS includes the new formats', () => {
        expect(SUPPORTED_EXTENSIONS).toEqual(expect.arrayContaining(['.glb', '.gltf', '.usdz', '.step', '.stp']));
    });
});
