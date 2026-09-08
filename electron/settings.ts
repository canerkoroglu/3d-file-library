import { getDatabase } from './database';

/** Small key/value store for user preferences, persisted in the library database. */
export function getSetting<T>(key: string, fallback: T): T {
    const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return fallback;
    try {
        return JSON.parse(row.value) as T;
    } catch {
        return fallback;
    }
}

export function setSetting(key: string, value: unknown): void {
    if (value === null || value === undefined) {
        getDatabase().prepare('DELETE FROM settings WHERE key = ?').run(key);
        return;
    }
    getDatabase()
        .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key, JSON.stringify(value));
}
