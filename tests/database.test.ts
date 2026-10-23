import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('better-sqlite3', async () => ({ default: (await import('./helpers/sqliteShim')).default }));

const { initDatabase, closeDatabase, getDatabase, SCHEMA_VERSION } = await import('../electron/database');
const library = await import('../electron/library');
const { default: Database } = await import('./helpers/sqliteShim');

let dir: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelist-db-'));
});

afterEach(() => {
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
});

/** A database as the very first release created it: no versioning, narrow file_type CHECK, legacy collection_id. */
function createLegacyDatabase(file: string): void {
    const db = new Database(file);
    db.exec(`
        CREATE TABLE collections (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('collection', 'watched')), folder_path TEXT, is_active INTEGER DEFAULT 1);
        CREATE TABLE models (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, filepath TEXT NOT NULL UNIQUE,
            display_name TEXT, file_size INTEGER NOT NULL, file_type TEXT NOT NULL CHECK(file_type IN ('stl', '3mf', 'obj')),
            collection_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, modified_at DATETIME, thumbnail_path TEXT,
            FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL);
        CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL);
        CREATE TABLE model_tags (model_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (model_id, tag_id),
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE, FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE);
        CREATE TABLE model_collections (model_id INTEGER NOT NULL, collection_id INTEGER NOT NULL, PRIMARY KEY (model_id, collection_id),
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE, FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE);

        INSERT INTO collections (id, name, type) VALUES (1, 'Favourites', 'collection');
        INSERT INTO models (id, filename, filepath, file_size, file_type, collection_id)
            VALUES (1, 'benchy.stl', '/library/boats/benchy.stl', 1234, 'stl', 1);
        INSERT INTO tags (id, name, color) VALUES (100, 'Boats', '#123456');
        INSERT INTO model_tags (model_id, tag_id) VALUES (1, 100);
    `);
    db.close();
}

describe('database migrations', () => {
    it('upgrades a legacy database to the latest schema without losing links', () => {
        const file = path.join(dir, 'legacy.db');
        createLegacyDatabase(file);

        const db = initDatabase(file);
        expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);

        // The v6 table rebuild must not cascade-delete tags or collection membership.
        expect(db.prepare('SELECT tag_id FROM model_tags WHERE model_id = 1').all()).toEqual([{ tag_id: 100 }]);
        expect(db.prepare('SELECT collection_id FROM model_collections WHERE model_id = 1').all()).toEqual([{ collection_id: 1 }]);
        expect(db.prepare('SELECT folder_path FROM models WHERE id = 1').get()).toEqual({ folder_path: '/library/boats' });

        // Newer file types are accepted after the CHECK constraint was widened.
        expect(() =>
            db.prepare("INSERT INTO models (filename, filepath, file_size, file_type) VALUES ('a.glb', '/x/a.glb', 1, 'glb')").run(),
        ).not.toThrow();

        // Foreign keys are switched on once migrations are done.
        expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    });

    it('is a no-op when opened a second time', () => {
        const file = path.join(dir, 'fresh.db');
        initDatabase(file);
        closeDatabase();
        const db = initDatabase(file);
        expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
        expect((db.prepare('SELECT COUNT(*) AS c FROM tags').get() as { c: number }).c).toBeGreaterThan(0);
    });
});

describe('library', () => {
    function file(name: string, content = 'solid x\nendsolid x\n'): string {
        const full = path.join(dir, name);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
        return full;
    }

    beforeEach(() => {
        initDatabase(':memory:');
    });

    it('attaches only each model’s own tags and collections to a page of results', () => {
        const a = library.importModel(file('a.stl'), null)!;
        const b = library.importModel(file('b.stl'), null)!;
        const db = getDatabase();
        const tag = db.prepare("INSERT INTO tags (name, color) VALUES ('Red', '#ff0000')").run().lastInsertRowid as number;
        const collection = db.prepare("INSERT INTO collections (name, type) VALUES ('Box', 'collection')").run().lastInsertRowid as number;
        db.prepare('INSERT INTO model_tags (model_id, tag_id) VALUES (?, ?)').run(a.id, tag);
        db.prepare('INSERT INTO model_collections (model_id, collection_id) VALUES (?, ?)').run(b.id, collection);

        const page = library.getModelsPage({ limit: 10 });
        const byName = new Map(page.items.map((m) => [m.filename, m]));
        expect(byName.get('a.stl')!.tags.map((t) => t.name)).toEqual(['Red']);
        expect(byName.get('a.stl')!.collectionIds).toEqual([]);
        expect(byName.get('b.stl')!.tags).toEqual([]);
        expect(byName.get('b.stl')!.collectionIds).toEqual([collection]);
    });

    it('rebuilds the search index in one pass', () => {
        library.importModel(file('dragon.stl'), null);
        library.importModel(file('castle.stl'), null);
        getDatabase().exec('DELETE FROM models_fts');
        library.rebuildSearchIndex();
        expect((getDatabase().prepare('SELECT COUNT(*) AS c FROM models_fts').get() as { c: number }).c).toBe(2);
        expect(library.getModelsPage({ searchQuery: 'dragon' }).items.map((m) => m.filename)).toEqual(['dragon.stl']);
    });

    it('renames a file, including a change of letter case only', async () => {
        const { id } = library.importModel(file('Part.stl'), null)!;
        await library.renameModelFile(id, 'part');
        const renamed = library.getModel(id)!;
        expect(renamed.filename).toBe('part.stl');
        expect(fs.existsSync(renamed.filepath)).toBe(true);
        expect(fs.readdirSync(dir).filter((n) => n.toLowerCase() === 'part.stl')).toEqual(['part.stl']);
    });

    it('refuses to rename over a different existing file', async () => {
        const { id } = library.importModel(file('one.stl'), null)!;
        file('two.stl');
        await expect(library.renameModelFile(id, 'two')).rejects.toThrow('already exists');
    });

    it('only compares embeddings made by the same model', () => {
        const a = library.importModel(file('a.stl'), null)!;
        const b = library.importModel(file('b.stl'), null)!;
        const c = library.importModel(file('c.stl'), null)!;
        library.setEmbedding(a.id, 'model-x', [1, 0, 0]);
        library.setEmbedding(b.id, 'model-x', [0.9, 0.1, 0]);
        library.setEmbedding(c.id, 'model-y', [1, 0, 0]);
        expect(library.findSimilar(a.id).map((m) => m.id)).toEqual([b.id]);
    });
});
