/**
 * Carries preferences across the move of the interface from file:// to app://bundle.
 *
 * Versions up to 1.0.2 kept the theme in the localStorage of the file:// origin. The app:// origin has
 * its own, empty storage, and file:// pages can no longer reach the old storage (the file:// extra
 * privileges are switched off by a fuse). So on the first start after updating, the old value is read
 * straight from Chromium's localStorage database on disk and remembered in the settings table; the
 * renderer adopts it if it has no theme of its own yet.
 *
 * This is best effort: if the value cannot be found, the theme simply starts as "system".
 */
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getSetting, setSetting } from './settings';

const DONE_KEY = 'migration.legacyStorageRead';
const THEME_KEY = 'migration.legacyTheme';
const THEMES = ['dark', 'light', 'system'] as const;

/** LevelDB key Chromium uses for localStorage['theme'] of the file:// origin. */
const LEGACY_THEME_KEY = Buffer.from('_file://\u0000\u0001theme', 'latin1');

/**
 * Finds the last value written for the key in LevelDB log/table files. Values are stored as a varint
 * length followed by a one-byte encoding marker (1 = Latin-1) and the text.
 */
export function findLegacyTheme(files: Buffer[]): string | null {
    let found: string | null = null;
    for (const data of files) {
        let from = 0;
        for (;;) {
            const at = data.indexOf(LEGACY_THEME_KEY, from);
            if (at < 0) break;
            from = at + LEGACY_THEME_KEY.length;
            const length = data[from];
            if (length === undefined || length < 2 || length > 16 || data[from + 1] !== 1) continue;
            const value = data.subarray(from + 2, from + 1 + length).toString('latin1');
            if ((THEMES as readonly string[]).includes(value)) found = value;
        }
    }
    return found;
}

function readLocalStorageFiles(userDataDir: string): Buffer[] {
    const dir = path.join(userDataDir, 'Local Storage', 'leveldb');
    let names: string[];
    try {
        names = fs.readdirSync(dir).filter((n) => /^\d+\.(log|ldb)$/.test(n));
    } catch {
        return [];
    }
    // Oldest first, so the newest write wins.
    names.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return names.flatMap((n) => {
        try {
            return [fs.readFileSync(path.join(dir, n))];
        } catch {
            return [];
        }
    });
}

/** Runs once per library: picks up the theme saved by a version that stored it under file://. */
export function readLegacyPreferences(): void {
    if (getSetting<boolean>(DONE_KEY, false)) return;
    try {
        const theme = findLegacyTheme(readLocalStorageFiles(app.getPath('userData')));
        if (theme) {
            setSetting(THEME_KEY, theme);
            console.log(`[Migration] Kept the theme "${theme}" from the previous version`);
        }
    } catch (error) {
        console.warn('[Migration] Could not read preferences from the previous version:', error);
    }
    setSetting(DONE_KEY, true);
}

/** The theme saved by the previous version, if there was one. */
export function getLegacyTheme(): string | null {
    return getSetting<string | null>(THEME_KEY, null);
}
