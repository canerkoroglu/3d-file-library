/** Duplicate detection and embedding-based similarity. */
import { getDatabase } from '../database';
import { cosineSimilarity, deserializeVector, embeddingText, serializeVector } from '../ai/vector';
import type { DuplicateReport, Model, ModelWithTags } from '../../src/types';
import { MODEL_COLUMNS, hydrate, rowToModel } from './rows';
import type { ModelRow } from './rows';

// ============ Duplicates ============

/** A discrete key for near-duplicate grouping: exact triangle count + bbox rounded to 0.1 units. */
export function geometrySignature(model: Model): string | null {
    if (!model.triangleCount || !model.bbox) return null;
    const r = (n: number) => Math.round(n * 10) / 10;
    return `${model.triangleCount}:${r(model.bbox.x)}:${r(model.bbox.y)}:${r(model.bbox.z)}`;
}

export function findDuplicates(): DuplicateReport {
    const db = getDatabase();
    const hashes = db.prepare(`
        SELECT content_hash FROM models
        WHERE content_hash IS NOT NULL AND missing_since IS NULL
        GROUP BY content_hash HAVING COUNT(*) > 1
    `).all() as Array<{ content_hash: string }>;

    const byHash = db.prepare(`SELECT ${MODEL_COLUMNS} FROM models m WHERE m.content_hash = ? AND m.missing_since IS NULL ORDER BY m.created_at ASC`);
    const groups = hashes.map(({ content_hash }) => {
        const models = (byHash.all(content_hash) as ModelRow[]).map(rowToModel);
        return {
            hash: content_hash,
            models,
            totalSize: models.reduce((sum, m) => sum + m.fileSize, 0),
        };
    });
    groups.sort((a, b) => b.totalSize - a.totalSize);

    const totalWasted = groups.reduce((sum, g) => sum + (g.models.length - 1) * g.models[0].fileSize, 0);
    const unhashed = db.prepare('SELECT COUNT(*) AS count FROM models WHERE content_hash IS NULL AND missing_since IS NULL').get() as { count: number };

    // Near-duplicates: identical geometry but different bytes (e.g. the same model re-exported to
    // another format or container). Group by geometry signature; keep groups spanning >1 hash.
    const geomRows = db.prepare(
        `SELECT ${MODEL_COLUMNS} FROM models m WHERE m.triangle_count IS NOT NULL AND m.triangle_count > 0 AND m.missing_since IS NULL`,
    ).all() as ModelRow[];
    const bySignature = new Map<string, Model[]>();
    for (const row of geomRows) {
        const model = rowToModel(row);
        const signature = geometrySignature(model);
        if (!signature) continue;
        const list = bySignature.get(signature);
        if (list) list.push(model);
        else bySignature.set(signature, [model]);
    }
    const nearDuplicateGroups = [...bySignature.entries()]
        .filter(([, models]) => models.length > 1 && new Set(models.map((m) => m.contentHash)).size > 1)
        .map(([signature, models]) => ({ signature, models, totalSize: models.reduce((sum, m) => sum + m.fileSize, 0) }))
        .sort((a, b) => b.totalSize - a.totalSize);

    return { groups, nearDuplicateGroups, totalWasted, groupCount: groups.length, unhashedCount: unhashed.count };
}

// ============ Semantic search (embeddings) ============

/** Available (non-missing) models whose embedding is absent or was made with a different model. */
export function getModelsNeedingEmbedding(embeddingModel: string): Array<{ id: number; text: string }> {
    const db = getDatabase();
    const rows = db.prepare(`
        SELECT ${MODEL_COLUMNS} FROM models m
        LEFT JOIN model_embeddings e ON e.model_id = m.id
        WHERE m.missing_since IS NULL AND (e.model_id IS NULL OR e.model != ?)
    `).all(embeddingModel) as ModelRow[];
    return rows
        .map((row) => ({ id: row.id, text: embeddingText(rowToModel(row)) }))
        .filter((entry) => entry.text.length > 0);
}

/** Stores (or replaces) one model's embedding vector. */
export function setEmbedding(modelId: number, model: string, vector: number[]): void {
    getDatabase().prepare(`
        INSERT INTO model_embeddings (model_id, model, dims, vector, generated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(model_id) DO UPDATE SET model = excluded.model, dims = excluded.dims, vector = excluded.vector, generated_at = excluded.generated_at
    `).run(modelId, model, vector.length, serializeVector(vector), new Date().toISOString());
}

/** Returns the available models most similar to the given one, by cosine of their embeddings. */
export function findSimilar(modelId: number, limit = 12): ModelWithTags[] {
    const db = getDatabase();
    const target = db.prepare('SELECT vector, model, dims FROM model_embeddings WHERE model_id = ?').get(modelId) as
        | { vector: Buffer; model: string; dims: number }
        | undefined;
    if (!target) return [];
    const targetVector = deserializeVector(target.vector);

    // Vectors from different embedding models live in different spaces; only compare like with like.
    const rows = db.prepare(`
        SELECT e.model_id AS id, e.vector AS vector
        FROM model_embeddings e JOIN models m ON m.id = e.model_id
        WHERE m.missing_since IS NULL AND e.model_id != ? AND e.model = ? AND e.dims = ?
    `).all(modelId, target.model, target.dims) as Array<{ id: number; vector: Buffer }>;

    const scored = rows
        .map((row) => ({ id: row.id, score: cosineSimilarity(targetVector, deserializeVector(row.vector)) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    if (scored.length === 0) return [];

    const placeholders = scored.map(() => '?').join(',');
    const models = db.prepare(`SELECT ${MODEL_COLUMNS} FROM models m WHERE m.id IN (${placeholders})`).all(...scored.map((s) => s.id)) as ModelRow[];
    const byId = new Map(models.map((row) => [row.id, rowToModel(row)]));
    const ordered = scored.map((s) => byId.get(s.id)).filter((m): m is Model => Boolean(m));
    return hydrate(ordered);
}

/** How many available models already have an embedding, and how many there are in total. */
export function getEmbeddingStats(): { embedded: number; total: number } {
    const db = getDatabase();
    const embedded = (db.prepare('SELECT COUNT(*) AS c FROM model_embeddings e JOIN models m ON m.id = e.model_id WHERE m.missing_since IS NULL').get() as { c: number }).c;
    const total = (db.prepare('SELECT COUNT(*) AS c FROM models WHERE missing_since IS NULL').get() as { c: number }).c;
    return { embedded, total };
}
