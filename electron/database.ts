import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

export const initDatabase = async (): Promise<void> => {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'modelist.db');

  // Ensure directory exists
  fs.mkdirSync(userDataPath, { recursive: true });

  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('collection', 'watched')),
      folder_path TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS model_collections (
      model_id INTEGER NOT NULL,
      collection_id INTEGER NOT NULL,
      PRIMARY KEY (model_id, collection_id),
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_models_filepath ON models(filepath);
    CREATE INDEX IF NOT EXISTS idx_models_collection ON models(collection_id); -- kept for legacy support until fully dropped
    CREATE INDEX IF NOT EXISTS idx_model_tags_model ON model_tags(model_id);
    CREATE INDEX IF NOT EXISTS idx_model_tags_tag ON model_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_model_collections_model ON model_collections(model_id);
    CREATE INDEX IF NOT EXISTS idx_model_collections_collection ON model_collections(collection_id);
  `);

  // Migration: Add source_metadata column if it doesn't exist
  const tableInfo = db.prepare("PRAGMA table_info(models)").all() as Array<{ name: string }>;
  const hasSourceMetadata = tableInfo.some(col => col.name === 'source_metadata');

  if (!hasSourceMetadata) {
    console.log('Running migration: Adding source_metadata column...');
    db.exec('ALTER TABLE models ADD COLUMN source_metadata TEXT');
    console.log('Migration completed successfully');
  }

  // Migration: Move collection_id to model_collections table
  const hasModelCollections = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='model_collections'").get() as { count: number };
  if (hasModelCollections.count > 0) {
    const isNewTableEmpty = (db.prepare("SELECT COUNT(*) as count FROM model_collections").get() as { count: number }).count === 0;
    const hasLegacyData = (db.prepare("SELECT COUNT(*) as count FROM models WHERE collection_id IS NOT NULL").get() as { count: number }).count > 0;

    if (isNewTableEmpty && hasLegacyData) {
      console.log('Running migration: Moving collection_id to model_collections...');
      db.exec(`
            INSERT INTO model_collections (model_id, collection_id)
            SELECT id, collection_id FROM models WHERE collection_id IS NOT NULL
          `);
      console.log('Migration to model_collections completed.');
    }
  }

  // Insert default tags if they don't exist
  const defaultTags = [
    { name: 'Draft', color: '#fbbf24' },
    { name: 'Final', color: '#60a5fa' },
    { name: 'Multi-color', color: '#a78bfa' },
    { name: 'Print Next', color: '#fb923c' },
    { name: 'Printed', color: '#4ade80' },
    { name: 'Prototype', color: '#f472b6' },
    { name: 'Urgent', color: '#f87171' },
  ];

  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)');
  defaultTags.forEach(tag => insertTag.run(tag.name, tag.color));

  console.log('Database initialized successfully');
};

export const getDatabase = (): Database.Database => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

export const closeDatabase = (): void => {
  if (db) {
    db.close();
  }
};
