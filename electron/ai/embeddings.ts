/**
 * Builds the semantic-search index: embeds every available model that lacks a current-model
 * embedding and stores the vectors. Orchestration only — the embedding call lives in provider.ts
 * and the storage in library.ts (mirrors how enrichment is split).
 */
import { embed, getAiSettings } from './provider';
import { getModelsNeedingEmbedding, notifyUser, setEmbedding } from '../library';

const BATCH_SIZE = 32;
let cancelled = false;

export function cancelEmbeddingBuild(): void {
    cancelled = true;
}

export interface EmbeddingBuildResult {
    embedded: number;
    failed: number;
    total: number;
    cancelled: boolean;
}

export async function buildEmbeddings(): Promise<EmbeddingBuildResult> {
    cancelled = false;
    const model = getAiSettings().embeddingModel.trim();
    if (!model) {
        notifyUser({ kind: 'error', title: 'No embedding model', message: 'Set an embedding model in Settings → AI assistant first.' });
        return { embedded: 0, failed: 0, total: 0, cancelled: false };
    }

    const targets = getModelsNeedingEmbedding(model);
    const total = targets.length;
    if (total === 0) return { embedded: 0, failed: 0, total: 0, cancelled: false };

    notifyUser({ kind: 'info', title: 'Building semantic index', message: `Embedding ${total} model${total === 1 ? '' : 's'}…` });

    let embedded = 0;
    let failed = 0;
    for (let i = 0; i < targets.length && !cancelled; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);
        try {
            const vectors = await embed(batch.map((t) => t.text));
            batch.forEach((t, j) => {
                const vector = vectors[j];
                if (vector && vector.length > 0) {
                    setEmbedding(t.id, model, vector);
                    embedded += 1;
                } else {
                    failed += 1;
                }
            });
        } catch (error) {
            // A whole batch failed (server down, model missing, auth) — stop and surface it.
            notifyUser({ kind: 'error', title: 'Embedding stopped', message: error instanceof Error ? error.message : 'The embedding request failed.' });
            return { embedded, failed: total - embedded, total, cancelled: false };
        }
    }

    return { embedded, failed, total, cancelled };
}
