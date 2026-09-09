/**
 * Background queue that asks the assistant to describe models one at a time.
 * Local models are slow, so this runs at concurrency 1, can be cancelled, and
 * reports progress the same way the indexer does.
 */
import { getDatabase } from '../database';
import { getEnrichmentSource, notifyModelsUpdated, notifyUser, setAiMetadata } from '../library';
import { AiError, chatJson, getAiConfig } from './provider';
import { buildEnrichmentMessages, parseEnrichment } from './prompts';
import type { AiProgress, EnrichmentTarget } from '../../src/types';

const PROGRESS_THROTTLE_MS = 300;
const MAX_CONSECUTIVE_FAILURES = 5;

const queue: number[] = [];
const queued = new Set<number>();
let active: { modelId: number; name: string } | null = null;
let running = false;
let cancelled = false;
let completed = 0;
let failed = 0;
let consecutiveFailures = 0;
let lastError: string | undefined;
let onProgress: ((progress: AiProgress) => void) | null = null;
let lastProgressAt = 0;
let progressTimer: NodeJS.Timeout | null = null;

export function getEnrichmentProgress(): AiProgress {
    const pending = queue.length + (active ? 1 : 0);
    return {
        queued: queue.length,
        active: active ? 1 : 0,
        completed,
        failed,
        total: completed + failed + pending,
        isRunning: pending > 0,
        current: active?.name,
        lastError,
    };
}

function emitProgress(force = false): void {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastProgressAt < PROGRESS_THROTTLE_MS) {
        if (!progressTimer) {
            progressTimer = setTimeout(() => {
                progressTimer = null;
                emitProgress(true);
            }, PROGRESS_THROTTLE_MS);
        }
        return;
    }
    lastProgressAt = now;
    onProgress(getEnrichmentProgress());
}

export function startEnrichment(listener: (progress: AiProgress) => void): void {
    onProgress = listener;
}

/** Queues models; returns how many were newly queued. */
export function enqueueEnrichment(target: EnrichmentTarget): number {
    const db = getDatabase();
    let ids: number[];
    if ('ids' in target) {
        ids = target.ids;
    } else {
        const where = target.scope === 'missing' ? 'WHERE ai_metadata IS NULL AND missing_since IS NULL' : 'WHERE missing_since IS NULL';
        ids = (db.prepare(`SELECT id FROM models ${where} ORDER BY id`).all() as Array<{ id: number }>).map((r) => r.id);
    }

    let added = 0;
    for (const id of ids) {
        if (queued.has(id) || active?.modelId === id) continue;
        queue.push(id);
        queued.add(id);
        added++;
    }
    if (added > 0) {
        cancelled = false;
        void pump();
    }
    emitProgress(true);
    return added;
}

export function cancelEnrichment(): void {
    cancelled = true;
    queue.length = 0;
    queued.clear();
    emitProgress(true);
}

async function enrichOne(modelId: number): Promise<void> {
    const source = getEnrichmentSource(modelId);
    if (!source) return; // model removed meanwhile
    const config = getAiConfig();
    const raw = await chatJson(buildEnrichmentMessages(source), { maxTokens: 900, temperature: 0.2 });
    const enrichment = parseEnrichment(raw, source.existingTags, config.model);
    setAiMetadata(modelId, enrichment);
}

async function pump(): Promise<void> {
    if (running) return;
    running = true;
    try {
        while (queue.length > 0 && !cancelled) {
            const modelId = queue.shift()!;
            queued.delete(modelId);
            const row = getDatabase().prepare('SELECT filename FROM models WHERE id = ?').get(modelId) as { filename: string } | undefined;
            if (!row) continue;
            active = { modelId, name: row.filename };
            emitProgress();

            try {
                await enrichOne(modelId);
                completed++;
                consecutiveFailures = 0;
                notifyModelsUpdated();
            } catch (error) {
                failed++;
                consecutiveFailures++;
                lastError = error instanceof Error ? error.message : String(error);
                console.error(`[AI] Enrichment failed for ${row.filename}: ${lastError}`);
                // A server that is down or misconfigured fails every request; stop instead of burning through the queue.
                if (error instanceof AiError && (error.kind === 'unreachable' || error.kind === 'auth' || error.kind === 'model' || error.kind === 'disabled')) {
                    const remaining = queue.length;
                    cancelEnrichment();
                    notifyUser({ kind: 'error', title: 'AI analysis stopped', message: `${lastError}${remaining > 0 ? ` ${remaining} models were left unprocessed.` : ''}` });
                    break;
                }
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    const remaining = queue.length;
                    cancelEnrichment();
                    notifyUser({ kind: 'error', title: 'AI analysis stopped after repeated failures', message: `${lastError}${remaining > 0 ? ` ${remaining} models were left unprocessed.` : ''}` });
                    break;
                }
            } finally {
                active = null;
            }
        }
    } finally {
        running = false;
        active = null;
        emitProgress(true);
        if (completed > 0 || failed > 0) {
            if (failed > 0 && !cancelled) {
                notifyUser({ kind: 'warning', title: `AI analysis finished with ${failed} failure${failed === 1 ? '' : 's'}`, message: lastError });
            }
            completed = 0;
            failed = 0;
            consecutiveFailures = 0;
        }
    }
}
