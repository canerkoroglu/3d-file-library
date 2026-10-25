import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {} }));
const { findLegacyTheme } = await import('../electron/legacyMigration');

/** A LevelDB log record as Chromium writes it for localStorage[key] = value on the file:// origin. */
function record(value: string): Buffer {
    const key = Buffer.from('_file://\u0000\u0001theme', 'latin1');
    const body = Buffer.concat([Buffer.from([1]), Buffer.from(value, 'latin1')]);
    return Buffer.concat([Buffer.from('junk'), key, Buffer.from([body.length]), body, Buffer.from('\u0001\u0012META', 'latin1')]);
}

describe('legacy theme migration', () => {
    it('reads the theme stored by versions that ran on file://', () => {
        expect(findLegacyTheme([record('light')])).toBe('light');
    });

    it('uses the most recent write', () => {
        expect(findLegacyTheme([Buffer.concat([record('dark'), record('system')])])).toBe('system');
        expect(findLegacyTheme([record('dark'), record('light')])).toBe('light');
    });

    it('ignores other origins and unknown values', () => {
        const otherOrigin = Buffer.from('_app://bundle\u0000\u0001theme\u0006\u0001light', 'latin1');
        expect(findLegacyTheme([otherOrigin])).toBeNull();
        expect(findLegacyTheme([record('purple')])).toBeNull();
        expect(findLegacyTheme([])).toBeNull();
    });
});
