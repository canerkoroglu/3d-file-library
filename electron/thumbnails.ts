/**
 * Thumbnail rendering queue. The renderer process owns WebGL, so 3D previews are
 * rendered there one at a time on request from the main process. Results come back
 * as base64 PNG and are resized and stored next to the other thumbnails.
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

interface RenderJob {
    modelId: number;
    filepath: string;
    fileType: FileType;
    attempts: number;
}

let window: BrowserWindow | null = null;
let rendererReady = false;
let nextJobId = 1;
const queue: RenderJob[] = [];
const queuedIds = new Set<number>();
let active: { jobId: number; job: RenderJob; timer: NodeJS.Timeout } | null = null;

export function getThumbnailQueueSize(): number {
    return queue.length + (active ? 1 : 0);
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
    drain();
}

export function cancelThumbnailRender(modelId: number): void {
    if (!queuedIds.has(modelId)) return;
    queuedIds.delete(modelId);
    const index = queue.findIndex((job) => job.modelId === modelId);
    if (index >= 0) queue.splice(index, 1);
}

function drain(): void {
    if (active || !rendererReady || !window || window.isDestroyed()) return;
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
    if (!active || active.jobId !== jobId) return;
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

    drain();
}

export function registerThumbnailIpc(): void {
    ipcMain.on('thumbnail:ready', () => {
        console.log(`[Thumbnails] Renderer ready (${queue.length} queued)`);
        rendererReady = true;
        drain();
    });
    ipcMain.on('thumbnail:rendered', (_event, result: ThumbnailRenderResult) => {
        void finish(result.jobId, result);
    });
}
