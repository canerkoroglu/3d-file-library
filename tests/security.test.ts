import { describe, expect, it, vi } from 'vitest';
import path from 'path';

vi.mock('electron', () => ({ app: {}, net: {}, protocol: {}, session: {}, shell: {} }));
const { grantPaths, isGranted, appPageUrl } = await import('../electron/security');

describe('granted paths', () => {
    it('accepts only paths the user chose', () => {
        const chosen = path.resolve('/library/thing.zip');
        expect(isGranted(chosen)).toBe(false);
        grantPaths([chosen]);
        expect(isGranted(chosen)).toBe(true);
        expect(isGranted(path.resolve('/library/other.zip'))).toBe(false);
        expect(isGranted('')).toBe(false);
    });

    it('normalises paths before comparing', () => {
        grantPaths([path.resolve('/a/b/model.stl')]);
        expect(isGranted(path.resolve('/a/b/../b/./model.stl'))).toBe(true);
    });
});

describe('app page URL', () => {
    it('serves the UI from app://bundle', () => {
        expect(appPageUrl()).toBe('app://bundle/index.html');
        expect(appPageUrl('thumbnail-renderer')).toBe('app://bundle/index.html#thumbnail-renderer');
    });
});
