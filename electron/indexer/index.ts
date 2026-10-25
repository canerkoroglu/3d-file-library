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
import { applyAnalysis, markModelMissing, notifyUser, thumbnailStrengthOf } from '../library';
import type { AnalysisJob, AnalysisResult, WorkerRequest, WorkerResponse } from '../analyzers/types';
import type { FileType, IndexProgress } from '../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'indexer-worker.js');
const CONCURRENCY = 2;
const PROGRESS_THROTTLE_MS = 250;
/** A job may take this long, plus JOB_TIMEOUT_PER_MB_MS per megabyte, before the worker is considered hung. */
const JOB_TIMEOUT_BASE_MS = 60_000;
const JOB_TIMEOUT_PER_MB_MS = 250;
/** A file that crashes or hangs the worker this many times is given up on instead of retried forever. */
const MAX_ATTEMPTS = 2;

interface QueueEntry {
    modelId: number;
    force: boolean;
    /** How many times this entry was in flight when the worker died. */
    attempts?: number;
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
const jobTimers = new Map<number, NodeJS.Timeout>();

let completed = 0;
let failed = 0;
const failedNames: string[] = [];
let progressTimer: NodeJS.Timeout | null = null;
let lastProgressAt = 0;

export function getProgress(): IndexProgress {
    const pending = queue.length + inflight.size;
    const thumbnailsQueued = callbacks?.getThumbnailQueueSize() ?? 0;
    return {
        queued: queue.length,
        active: inflight.size,
        completed,
        failed,
        total: completed + failed + pending,
        thumbnailsQueued,
        // Rendering previews is part of getting the library ready, so keep the indicator up until it is done.
        isRunning: pending > 0 || thumbnailsQueued > 0,
    };
}

/** Lets other queues (thumbnail rendering) refresh the progress shown to the user. */
export function reportProgress(): void {
    emitProgress();
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
    child = utilityProcess.fork(WORKER_PATH, [], { serviceName: 'meshvault-indexer' });

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
        // A file that keeps killing the worker is reported as failed rather than retried forever.
        for (const entry of inflight.values()) {
            if (queued.has(entry.modelId)) continue;
            entry.attempts = (entry.attempts ?? 0) + 1;
            if (entry.attempts >= MAX_ATTEMPTS) {
                console.error(`[Indexer] Giving up on model ${entry.modelId}: the worker stopped ${entry.attempts} times while analysing it`);
                failed++;
                rememberFailure(entry.modelId);
                continue;
            }
            queue.unshift(entry);
            queued.set(entry.modelId, entry);
        }
        clearJobTimers();
        inflight.clear();
        if (stopped) return;
        if (queue.length > 0) setTimeout(spawnWorker, 1000);
        else finishBatchIfIdle();
    });
}

function clearJobTimers(): void {
    for (const timer of jobTimers.values()) clearTimeout(timer);
    jobTimers.clear();
}

function jobTimeoutFor(filepath: string): number {
    let size = 0;
    try {
        size = fs.statSync(filepath).size;
    } catch {
        // The worker reports the real error; fall back to the base timeout.
    }
    return JOB_TIMEOUT_BASE_MS + Math.ceil(size / (1024 * 1024)) * JOB_TIMEOUT_PER_MB_MS;
}

/** A job that never answers means the worker is stuck on that file: give up on it and restart the worker. */
function handleJobTimeout(jobId: number): void {
    jobTimers.delete(jobId);
    const entry = inflight.get(jobId);
    if (!entry || !child) return;
    inflight.delete(jobId);
    console.error(`[Indexer] Analysis of model ${entry.modelId} timed out; restarting the worker`);
    failed++;
    rememberFailure(entry.modelId);
    // The exit handler re-queues the other in-flight jobs and spawns a fresh worker.
    child.kill();
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
        jobTimers.set(job.id, setTimeout(() => handleJobTimeout(job.id), jobTimeoutFor(job.filepath)));
        send({ type: 'analyze', job });
    }

    emitProgress();
    finishBatchIfIdle();
}

/** Once the queue drains, report the batch (including any failures) and reset the counters. */
function finishBatchIfIdle(): void {
    if (queue.length === 0 && inflight.size === 0) {
        emitProgress(true);
        if (failed > 0) {
            const examples = failedNames.slice(0, 3).join(', ');
            notifyUser({
                kind: 'warning',
                title: `${failed} file${failed === 1 ? '' : 's'} could not be analysed`,
                message: `${examples}${failed > 3 ? ', …' : ''}. They stay in the library without measurements; details are in the log.`,
            });
        }
        completed = 0;
        failed = 0;
        failedNames.length = 0;
    }
}

function rememberFailure(modelId: number): void {
    const row = getDatabase().prepare('SELECT filename FROM models WHERE id = ?').get(modelId) as { filename: string } | undefined;
    if (row && failedNames.length < 3) failedNames.push(row.filename);
}

function handleResult(message: Extract<WorkerResponse, { type: 'result' }>): void {
    if (stopped) return;
    const timer = jobTimers.get(message.id);
    if (timer) clearTimeout(timer);
    jobTimers.delete(message.id);
    // A late answer from a job that already timed out is ignored.
    if (!inflight.delete(message.id)) return;

    if (message.ok) {
        try {
            applyAnalysis(message.modelId, message.data);
            callbacks?.onModelIndexed(message.modelId, message.data);
            completed++;
        } catch (error) {
            console.error(`[Indexer] Failed to apply analysis for model ${message.modelId}:`, error);
            failed++;
            rememberFailure(message.modelId);
        }
    } else {
        console.error(`[Indexer] Analysis failed for model ${message.modelId}: ${message.error}`);
        failed++;
        rememberFailure(message.modelId);
    }

    pump();
}

export function startIndexer(newCallbacks: IndexerCallbacks): void {
    callbacks = newCallbacks;
    stopped = false;
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
    clearJobTimers();
    inflight.clear();
    if (child) {
        child.removeAllListeners();
        send({ type: 'shutdown' });
        child = null;
        workerReady = false;
    }
}
