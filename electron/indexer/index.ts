/**
 * Indexer coordinator. Keeps a queue of models that need analysis, feeds them to
 * the worker utility process a few at a time, and applies results to the database.
 */
import { utilityProcess, type UtilityProcess } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../database';
import { getThumbnailDir } from '../paths';
import { applyAnalysis, markModelMissing, thumbnailStrengthOf } from '../library';
import type { AnalysisJob, AnalysisResult, WorkerRequest, WorkerResponse } from '../analyzers/types';
import type { FileType, IndexProgress } from '../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'indexer-worker.js');
const CONCURRENCY = 2;
const PROGRESS_THROTTLE_MS = 250;

interface QueueEntry {
    modelId: number;
    force: boolean;
}

interface IndexerCallbacks {
    onProgress: (progress: IndexProgress) => void;
    onModelIndexed: (modelId: number, result: AnalysisResult) => void;
    getThumbnailQueueSize: () => number;
}

let child: UtilityProcess | null = null;
let workerReady = false;
let stopped = false;
let callbacks: IndexerCallbacks | null = null;
let nextJobId = 1;

const queue: QueueEntry[] = [];
const queued = new Map<number, QueueEntry>();
const inflight = new Map<number, QueueEntry>();

let completed = 0;
let failed = 0;
let progressTimer: NodeJS.Timeout | null = null;
let lastProgressAt = 0;

export function getProgress(): IndexProgress {
    const pending = queue.length + inflight.size;
    return {
        queued: queue.length,
        active: inflight.size,
        completed,
        failed,
        total: completed + failed + pending,
        thumbnailsQueued: callbacks?.getThumbnailQueueSize() ?? 0,
        isRunning: pending > 0,
    };
}

function emitProgress(force = false): void {
    if (!callbacks) return;
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
    callbacks.onProgress(getProgress());
}

function spawnWorker(): void {
    if (child || stopped) return;
    console.log('[Indexer] Starting worker process');
    child = utilityProcess.fork(WORKER_PATH, [], { serviceName: 'modelist-indexer' });

    child.on('message', (message: WorkerResponse) => {
        if (message.type === 'ready') {
            workerReady = true;
            pump();
            return;
        }
        if (message.type === 'result') handleResult(message);
    });

    child.on('exit', (code) => {
        console.warn(`[Indexer] Worker exited with code ${code}`);
        child = null;
        workerReady = false;
        // Put in-flight work back on the queue and restart if there is anything left to do.
        for (const entry of inflight.values()) {
            if (!queued.has(entry.modelId)) {
                queue.unshift(entry);
                queued.set(entry.modelId, entry);
            }
        }
        inflight.clear();
        if (queue.length > 0) setTimeout(spawnWorker, 1000);
    });
}

function send(message: WorkerRequest): void {
    child?.postMessage(message);
}

function buildJob(entry: QueueEntry): AnalysisJob | null {
    const row = getDatabase()
        .prepare('SELECT filepath, file_type, hash_mtime_ms, hash_size, content_hash, thumbnail_path FROM models WHERE id = ?')
        .get(entry.modelId) as
        | { filepath: string; file_type: FileType; hash_mtime_ms: number | null; hash_size: number | null; content_hash: string | null; thumbnail_path: string | null }
        | undefined;
    if (!row) return null;

    // Unreachable files are flagged (never deleted) and analysed once they come back.
    if (!fs.existsSync(row.filepath)) {
        markModelMissing(entry.modelId);
        return null;
    }

    // A recorded preview whose file disappeared (cache cleared) is worth a full re-analysis to recreate it.
    const thumbnailMissing = row.thumbnail_path !== null && !fs.existsSync(row.thumbnail_path);

    return {
        id: nextJobId++,
        modelId: entry.modelId,
        filepath: row.filepath,
        fileType: row.file_type,
        thumbnailDir: getThumbnailDir(),
        knownMtimeMs: row.hash_mtime_ms,
        knownSize: row.hash_size,
        hasHash: row.content_hash !== null,
        force: entry.force || thumbnailMissing,
        existingThumbnailStrength: thumbnailStrengthOf(entry.modelId),
    };
}

function pump(): void {
    if (!child || !workerReady) {
        if (queue.length > 0) spawnWorker();
        return;
    }

    while (inflight.size < CONCURRENCY && queue.length > 0) {
        const entry = queue.shift()!;
        queued.delete(entry.modelId);
        const job = buildJob(entry);
        if (!job) continue; // model was deleted while queued
        inflight.set(job.id, entry);
        send({ type: 'analyze', job });
    }

    emitProgress();
    if (queue.length === 0 && inflight.size === 0) {
        emitProgress(true);
        completed = 0;
        failed = 0;
    }
}

function handleResult(message: Extract<WorkerResponse, { type: 'result' }>): void {
    if (stopped) return;
    inflight.delete(message.id);

    if (message.ok) {
        try {
            applyAnalysis(message.modelId, message.data);
            callbacks?.onModelIndexed(message.modelId, message.data);
            completed++;
        } catch (error) {
            console.error(`[Indexer] Failed to apply analysis for model ${message.modelId}:`, error);
            failed++;
        }
    } else {
        console.error(`[Indexer] Analysis failed for model ${message.modelId}: ${message.error}`);
        failed++;
    }

    pump();
}

export function startIndexer(newCallbacks: IndexerCallbacks): void {
    callbacks = newCallbacks;
    spawnWorker();
}

export function enqueueModel(modelId: number, force = false): void {
    const existing = queued.get(modelId);
    if (existing) {
        existing.force = existing.force || force;
        return;
    }
    for (const entry of inflight.values()) {
        if (entry.modelId === modelId && !force) return;
    }
    const entry = { modelId, force };
    queue.push(entry);
    queued.set(modelId, entry);
    pump();
}

/** Queues every model, un-indexed ones first. Unchanged files return quickly from the worker. */
export function enqueueAll(force = false): number {
    const rows = getDatabase()
        .prepare('SELECT id FROM models WHERE missing_since IS NULL ORDER BY (indexed_at IS NULL) DESC, id ASC')
        .all() as Array<{ id: number }>;
    for (const { id } of rows) enqueueModel(id, force);
    return rows.length;
}

export function dequeueModel(modelId: number): void {
    const entry = queued.get(modelId);
    if (!entry) return;
    queued.delete(modelId);
    const index = queue.indexOf(entry);
    if (index >= 0) queue.splice(index, 1);
}

export function stopIndexer(): void {
    stopped = true;
    queue.length = 0;
    queued.clear();
    inflight.clear();
    if (child) {
        child.removeAllListeners();
        send({ type: 'shutdown' });
        child = null;
        workerReady = false;
    }
}
