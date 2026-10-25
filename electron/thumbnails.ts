/**
 * Thumbnail rendering queue. 3D previews need WebGL, so they are rendered one at a time in a
 * hidden window of their own (never the window the user is working in, so batches of renders do
 * not compete with the interface). The window is created when there is work and closed again after
 * a quiet period. Results come back as base64 PNG and are resized and stored with the other thumbnails.
 */
import { BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import sharp from 'sharp';
import { getThumbnailPath } from './paths';
import { notifyModelsUpdated, setThumbnail, THUMBNAIL_STRENGTH, thumbnailStrengthOf } from './library';
import type { FileType, ThumbnailRenderRequest, ThumbnailRenderResult, ThumbnailSource } from '../src/types';

const THUMBNAIL_SIZE = 512;
const RENDER_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;
/** Close the hidden render window after this long without work, to give its memory back. */
const IDLE_CLOSE_MS = 60_000;

interface RenderJob {
    modelId: number;
    filepath: string;
    fileType: FileType;
    attempts: number;
}

let window: BrowserWindow | null = null;
let windowFactory: (() => BrowserWindow) | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let rendererReady = false;
let stopped = false;
let nextJobId = 1;
let onQueueChange: (() => void) | null = null;

/** Called whenever the number of pending renders changes (used for the progress indicator). */
export function setThumbnailQueueListener(listener: (() => void) | null): void {
    onQueueChange = listener;
}
const queue: RenderJob[] = [];
const queuedIds = new Set<number>();
let active: { jobId: number; job: RenderJob; timer: NodeJS.Timeout } | null = null;

export function getThumbnailQueueSize(): number {
    return queue.length + (active ? 1 : 0);
}

/** Provides the function that creates the hidden render window (it needs the preload/page paths from main). */
export function setThumbnailWindowFactory(factory: (() => BrowserWindow) | null): void {
    windowFactory = factory;
}

function ensureWindow(): void {
    if (stopped || !windowFactory || (window && !window.isDestroyed())) return;
    const win = windowFactory();
    setThumbnailWindow(win);
    win.on('closed', () => {
        if (window === win) setThumbnailWindow(null);
        // Work left over (e.g. the window crashed) gets a fresh window.
        if (!stopped && (queue.length > 0 || active)) setTimeout(ensureWindow, 1000);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
        console.error(`[Thumbnails] Render window stopped (${details.reason}); restarting it`);
        if (!win.isDestroyed()) win.destroy();
    });
}

function scheduleIdleClose(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (queue.length > 0 || active || !window) return;
    idleTimer = setTimeout(() => {
        idleTimer = null;
        if (queue.length === 0 && !active && window && !window.isDestroyed()) {
            console.log('[Thumbnails] Closing the idle render window');
            window.destroy();
        }
    }, IDLE_CLOSE_MS);
}

export function setThumbnailWindow(win: BrowserWindow | null): void {
    window = win;
    rendererReady = false;
    if (win) {
        // A reload (dev HMR, crash) loses the in-progress job; requeue it once the page is ready again.
        win.webContents.on('did-start-loading', () => {
            rendererReady = false;
            if (active) {
                clearTimeout(active.timer);
                const job = active.job;
                active = null;
                if (!queuedIds.has(job.modelId)) {
                    queue.unshift(job);
                    queuedIds.add(job.modelId);
                }
            }
        });
    }
}

export async function saveThumbnailFromBase64(modelId: number, imageData: string, source: ThumbnailSource): Promise<string> {
    const outputPath = getThumbnailPath(modelId);
    const buffer = Buffer.from(imageData, 'base64');
    await sharp(buffer)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'contain', background: { r: 35, g: 35, b: 35, alpha: 1 } })
        .png()
        .toFile(outputPath);
    setThumbnail(modelId, outputPath, source);
    return outputPath;
}

/** Queues a 3D render unless the model already has a thumbnail at least as good as a render. */
export function requestThumbnailRender(modelId: number, filepath: string, fileType: FileType, force = false): void {
    if (queuedIds.has(modelId) || active?.job.modelId === modelId) return;
    if (!force && thumbnailStrengthOf(modelId) >= THUMBNAIL_STRENGTH.render) return;
    if (!fs.existsSync(filepath)) return;

    queue.push({ modelId, filepath, fileType, attempts: 0 });
    queuedIds.add(modelId);
    onQueueChange?.();
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
    ensureWindow();
    drain();
}

export function cancelThumbnailRender(modelId: number): void {
    if (!queuedIds.has(modelId)) return;
    queuedIds.delete(modelId);
    const index = queue.findIndex((job) => job.modelId === modelId);
    if (index >= 0) queue.splice(index, 1);
}

function drain(): void {
    if (stopped || active || !rendererReady || !window || window.isDestroyed()) return;
    const job = queue.shift();
    if (!job) return;
    queuedIds.delete(job.modelId);

    const jobId = nextJobId++;
    job.attempts++;
    const timer = setTimeout(() => finish(jobId, { jobId, ok: false, error: 'Render timed out' }), RENDER_TIMEOUT_MS);
    active = { jobId, job, timer };

    const request: ThumbnailRenderRequest = { jobId, modelId: job.modelId, filepath: job.filepath, fileType: job.fileType };
    window.webContents.send('thumbnail:render', request);
}

async function finish(jobId: number, result: ThumbnailRenderResult): Promise<void> {
    if (stopped || !active || active.jobId !== jobId) return;
    clearTimeout(active.timer);
    const job = active.job;
    active = null;

    if (result.ok && result.imageData) {
        try {
            // Re-check: the user may have captured a thumbnail while the render was in progress.
            if (thumbnailStrengthOf(job.modelId) < THUMBNAIL_STRENGTH.render) {
                await saveThumbnailFromBase64(job.modelId, result.imageData, 'render');
                console.log(`[Thumbnails] Rendered model ${job.modelId} (${queue.length} left)`);
                notifyModelsUpdated();
            }
        } catch (error) {
            console.error(`[Thumbnails] Failed to save render for model ${job.modelId}:`, error);
        }
    } else {
        console.warn(`[Thumbnails] Render failed for model ${job.modelId}: ${result.error ?? 'unknown error'}`);
        if (job.attempts < MAX_ATTEMPTS) {
            queue.push(job);
            queuedIds.add(job.modelId);
        }
    }

    onQueueChange?.();
    drain();
    scheduleIdleClose();
}

/** Stops dispatching and ignores in-flight results; called before the database closes. */
export function stopThumbnailQueue(): void {
    stopped = true;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (active) clearTimeout(active.timer);
    active = null;
    queue.length = 0;
    queuedIds.clear();
}

export function registerThumbnailIpc(): void {
    // Only the hidden render window may report; anything else is ignored.
    const fromRenderWindow = (event: Electron.IpcMainEvent) => Boolean(window && !window.isDestroyed() && event.sender === window.webContents);
    ipcMain.on('thumbnail:ready', (event) => {
        if (!fromRenderWindow(event)) return;
        console.log(`[Thumbnails] Renderer ready (${queue.length} queued)`);
        rendererReady = true;
        drain();
        scheduleIdleClose();
    });
    ipcMain.on('thumbnail:rendered', (event, result: ThumbnailRenderResult) => {
        if (!fromRenderWindow(event)) return;
        void finish(result.jobId, result);
    });
}
