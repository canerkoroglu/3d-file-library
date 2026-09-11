import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;

/**
 * Ordered, idempotent-by-version migrations. The current schema version is stored in
 * `PRAGMA user_version`; each entry runs exactly once, inside a transaction.
 */
const MIGRATIONS: Array<{ version: number; name: string; up: (db: Database.Database) => void }> = [
    {
        version: 1,
        name: 'baseline schema',
        up: (db) => {
            db.exec(`
                CREATE TABLE IF NOT EXISTS collections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK(type IN ('collection', 'watched')),
                    folder_path TEXT,
                    is_active INTEGER DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS models (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    filepath TEXT NOT NULL UNIQUE,
                    display_name TEXT,
                    file_size INTEGER NOT NULL,
                    file_type TEXT NOT NULL CHECK(file_type IN ('stl', '3mf', 'obj')),
                    collection_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    modified_at DATETIME,
                    thumbnail_path TEXT,
                    source_metadata TEXT,
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    color TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS model_tags (
                    model_id INTEGER NOT NULL,
                    tag_id INTEGER NOT NULL,
                    PRIMARY KEY (model_id, tag_id),
                    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS model_collections (
                    model_id INTEGER NOT NULL,
                    collection_id INTEGER NOT NULL,
                    PRIMARY KEY (model_id, collection_id),
                    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_models_filepath ON models(filepath);
                CREATE INDEX IF NOT EXISTS idx_model_tags_model ON model_tags(model_id);
                CREATE INDEX IF NOT EXISTS idx_model_tags_tag ON model_tags(tag_id);
                CREATE INDEX IF NOT EXISTS idx_model_collections_model ON model_collections(model_id);
                CREATE INDEX IF NOT EXISTS idx_model_collections_collection ON model_collections(collection_id);
            `);

            // Databases created before versioning existed may lack this column.
            const columns = db.prepare('PRAGMA table_info(models)').all() as Array<{ name: string }>;
            if (!columns.some((c) => c.name === 'source_metadata')) {
                db.exec('ALTER TABLE models ADD COLUMN source_metadata TEXT');
            }
        },
    },
    {
        version: 2,
        name: 'search index, file metadata, thumbnail provenance',
        up: (db) => {
            const columns = new Set(
                (db.prepare('PRAGMA table_info(models)').all() as Array<{ name: string }>).map((c) => c.name),
            );
            const add = (name: string, ddl: string) => {
                if (!columns.has(name)) db.exec(`ALTER TABLE models ADD COLUMN ${name} ${ddl}`);
            };

            add('folder_path', 'TEXT');
            add('thumbnail_source', 'TEXT');
            add('thumbnail_updated_at', 'DATETIME');
            add('content_hash', 'TEXT');
            add('hash_mtime_ms', 'INTEGER');
            add('hash_size', 'INTEGER');
            add('triangle_count', 'INTEGER');
            add('bbox_x', 'REAL');
            add('bbox_y', 'REAL');
            add('bbox_z', 'REAL');
            add('volume_mm3', 'REAL');
            add('print_meta', 'TEXT');
            add('readme_text', 'TEXT');
            add('indexed_at', 'DATETIME');

            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_models_content_hash ON models(content_hash);
                CREATE INDEX IF NOT EXISTS idx_models_folder_path ON models(folder_path);
                CREATE INDEX IF NOT EXISTS idx_models_created_at ON models(created_at);
                CREATE INDEX IF NOT EXISTS idx_models_file_type ON models(file_type);

                CREATE VIRTUAL TABLE IF NOT EXISTS models_fts USING fts5(
                    filename,
                    display_name,
                    folder_path,
                    tags,
                    source,
                    author,
                    license,
                    notes,
                    title,
                    designer,
                    description,
                    printer,
                    readme,
                    tokenize = 'trigram'
                );
            `);

            // Move legacy single-collection membership into the junction table.
            db.exec(`
                INSERT OR IGNORE INTO model_collections (model_id, collection_id)
                SELECT id, collection_id FROM models WHERE collection_id IS NOT NULL
            `);

            // Backfill folder_path from filepath.
            const rows = db.prepare('SELECT id, filepath FROM models WHERE folder_path IS NULL').all() as Array<{ id: number; filepath: string }>;
            const update = db.prepare('UPDATE models SET folder_path = ? WHERE id = ?');
            for (const row of rows) update.run(path.dirname(row.filepath), row.id);

            // Seed the search index from what is already known; the background analysis pass refines it later.
            db.exec(`
                INSERT INTO models_fts (rowid, filename, display_name, folder_path, tags, source, author, license, notes, title, designer, description, printer, readme)
                SELECT m.id,
                       m.filename,
                       COALESCE(m.display_name, ''),
                       COALESCE(m.folder_path, ''),
                       COALESCE((SELECT group_concat(t.name, ' ') FROM model_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.model_id = m.id), ''),
                       COALESCE(json_extract(m.source_metadata, '$.source'), ''),
                       COALESCE(json_extract(m.source_metadata, '$.author'), ''),
                       COALESCE(json_extract(m.source_metadata, '$.license'), ''),
                       COALESCE(json_extract(m.source_metadata, '$.notes'), ''),
                       '', '', '', '', ''
                FROM models m
                WHERE m.id NOT IN (SELECT rowid FROM models_fts)
            `);

            // Existing thumbnails were either 3MF-embedded or user captures; treat them as user-provided
            // so the new renderer does not overwrite them.
            db.exec(`UPDATE models SET thumbnail_source = 'capture', thumbnail_updated_at = created_at
                     WHERE thumbnail_path IS NOT NULL AND thumbnail_source IS NULL`);
        },
    },
    {
        version: 3,
        name: 'missing-file tracking',
        up: (db) => {
            const columns = new Set(
                (db.prepare('PRAGMA table_info(models)').all() as Array<{ name: string }>).map((c) => c.name),
            );
            if (!columns.has('missing_since')) db.exec('ALTER TABLE models ADD COLUMN missing_since DATETIME');
            db.exec('CREATE INDEX IF NOT EXISTS idx_models_missing_since ON models(missing_since)');
        },
    },
    {
        version: 4,
        name: 'settings table',
        up: (db) => {
            db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        },
    },
    {
        version: 5,
        name: 'AI enrichment and search column',
        up: (db) => {
            const columns = new Set(
                (db.prepare('PRAGMA table_info(models)').all() as Array<{ name: string }>).map((c) => c.name),
            );
            if (!columns.has('ai_metadata')) db.exec('ALTER TABLE models ADD COLUMN ai_metadata TEXT');
            if (!columns.has('ai_enriched_at')) db.exec('ALTER TABLE models ADD COLUMN ai_enriched_at DATETIME');

            // FTS5 tables cannot gain columns; recreate with the extra "ai" column and ask for a rebuild at startup.
            db.exec(`
                DROP TABLE IF EXISTS models_fts;
                CREATE VIRTUAL TABLE models_fts USING fts5(
                    filename, display_name, folder_path, tags, source, author, license, notes,
                    title, designer, description, printer, readme, ai,
                    tokenize = 'trigram'
                );
                INSERT INTO settings (key, value) VALUES ('search.needsRebuild', 'true')
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
            `);
        },
    },
    {
        version: 6,
        name: 'allow glb, usdz and step file types',
        up: (db) => {
            // SQLite cannot alter a CHECK in place; rebuild the models table from its own
            // (migration-evolved) schema with the widened file_type list, preserving rows and ids.
            // Foreign keys are OFF here (see initDatabase), so DROP TABLE does not cascade.
            const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='models'").get() as { sql: string };
            const rebuilt = row.sql
                .replace(/CHECK\s*\(\s*file_type\s+IN\s*\([^)]*\)\s*\)/i, "CHECK(file_type IN ('stl', '3mf', 'obj', 'glb', 'usdz', 'step'))")
                .replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["'`]?models["'`]?/i, 'CREATE TABLE "models_new"');
            db.exec(rebuilt);
            db.exec('INSERT INTO "models_new" SELECT * FROM models');
            db.exec('DROP TABLE models');
            db.exec('ALTER TABLE "models_new" RENAME TO models');
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_models_filepath ON models(filepath);
                CREATE INDEX IF NOT EXISTS idx_models_content_hash ON models(content_hash);
                CREATE INDEX IF NOT EXISTS idx_models_folder_path ON models(folder_path);
                CREATE INDEX IF NOT EXISTS idx_models_created_at ON models(created_at);
                CREATE INDEX IF NOT EXISTS idx_models_file_type ON models(file_type);
                CREATE INDEX IF NOT EXISTS idx_models_missing_since ON models(missing_since);
            `);
        },
    },
    {
        version: 7,
        name: 'embeddings for semantic search',
        up: (db) => {
            db.exec(`
                CREATE TABLE IF NOT EXISTS model_embeddings (
                    model_id INTEGER PRIMARY KEY,
                    model TEXT NOT NULL,
                    dims INTEGER NOT NULL,
                    vector BLOB NOT NULL,
                    generated_at TEXT NOT NULL,
                    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
                );
            `);
        },
    },
];

const DEFAULT_TAGS = [
    { name: 'Draft', color: '#fbbf24' },
    { name: 'Final', color: '#60a5fa' },
    { name: 'Multi-color', color: '#a78bfa' },
    { name: 'Print Next', color: '#fb923c' },
    { name: 'Printed', color: '#4ade80' },
    { name: 'Prototype', color: '#f472b6' },
    { name: 'Urgent', color: '#f87171' },
];

export function initDatabase(dbPath: string): Database.Database {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Foreign keys stay OFF while migrations run: a migration may rebuild the models table, and
    // DROP TABLE with FKs enabled would cascade-delete tag/collection links. The pragma is a no-op
    // inside a transaction (where each migration runs), so enable it once, after they all finish.
    const currentVersion = db.pragma('user_version', { simple: true }) as number;
    for (const migration of MIGRATIONS) {
        if (migration.version <= currentVersion) continue;
        console.log(`[DB] Applying migration ${migration.version}: ${migration.name}`);
        db.transaction(() => {
            migration.up(db!);
            db!.pragma(`user_version = ${migration.version}`);
        })();
    }
    db.pragma('foreign_keys = ON');

    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)');
    for (const tag of DEFAULT_TAGS) insertTag.run(tag.name, tag.color);

    return db;
}

export function getDatabase(): Database.Database {
    if (!db) throw new Error('Database not initialized');
    return db;
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
    }
}

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
