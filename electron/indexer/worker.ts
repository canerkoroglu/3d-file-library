/**
 * Indexer worker. Runs in an Electron utility process so hashing, mesh parsing and
 * image resizing never block the main process. It has no database access: results
 * are posted back to the main process, which owns all writes.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { hashFile } from '../analyzers/hash';
import { analyzeStl } from '../analyzers/stl';
import { analyzeObj } from '../analyzers/obj';
import { analyzeThreeMf } from '../analyzers/threemf';
import { findSidecars } from '../analyzers/sidecars';
import type { AnalysisJob, AnalysisResult, GeometryStats, WorkerRequest, WorkerResponse } from '../analyzers/types';
import type { PrintMetadata, ThumbnailSource } from '../../src/types';

const THUMBNAIL_SIZE = 512;
const THUMBNAIL_BACKGROUND = { r: 35, g: 35, b: 35, alpha: 1 };

// Must match THUMBNAIL_STRENGTH in electron/library.ts (kept local to avoid importing database code here).
const STRENGTH: Record<ThumbnailSource, number> = { capture: 5, embedded: 4, sidecar: 3, render: 2, folder: 1 };

const port = process.parentPort;

function post(message: WorkerResponse): void {
    port.postMessage(message);
}

async function writeThumbnail(input: Buffer | string, outputPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await sharp(input)
        .rotate()
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'contain', background: THUMBNAIL_BACKGROUND })
        .png()
        .toFile(outputPath);
}

async function analyze(job: AnalysisJob): Promise<AnalysisResult> {
    const stat = await fs.promises.stat(job.filepath);
    const mtimeMs = Math.floor(stat.mtimeMs);

    const unchanged = !job.force && job.hasHash && job.knownMtimeMs === mtimeMs && job.knownSize === stat.size;
    if (unchanged) {
        return { mtimeMs, size: stat.size, unchanged: true, hash: null, geometry: null, printMeta: null, readme: null, license: null, sourceSite: null, sourceUrl: null, thumbnail: null };
    }

    const [hash, sidecars] = await Promise.all([hashFile(job.filepath), findSidecars(job.filepath)]);

    let geometry: GeometryStats | null = null;
    let printMeta: PrintMetadata | null = null;
    let embedded: Buffer | null = null;

    try {
        if (job.fileType === 'stl') {
            geometry = await analyzeStl(job.filepath, stat.size);
        } else if (job.fileType === 'obj') {
            geometry = await analyzeObj(job.filepath);
        } else if (job.fileType === '3mf') {
            const analysis = await analyzeThreeMf(job.filepath);
            geometry = analysis.geometry;
            printMeta = analysis.printMeta;
            embedded = analysis.thumbnail;
        }
    } catch (error) {
        console.error(`[Indexer] Geometry analysis failed for ${job.filepath}:`, error);
    }

    // Pick the strongest preview candidate that beats what the model already has.
    const candidates: Array<{ source: ThumbnailSource; input: Buffer | string }> = [];
    if (embedded) candidates.push({ source: 'embedded', input: embedded });
    if (sidecars.imagePath && sidecars.imageSource === 'sidecar') candidates.push({ source: 'sidecar', input: sidecars.imagePath });
    if (sidecars.imagePath && sidecars.imageSource === 'folder') candidates.push({ source: 'folder', input: sidecars.imagePath });

    let thumbnail: AnalysisResult['thumbnail'] = null;
    for (const candidate of candidates) {
        if (STRENGTH[candidate.source] <= job.existingThumbnailStrength) continue;
        const outputPath = path.join(job.thumbnailDir, `${job.modelId}.png`);
        try {
            await writeThumbnail(candidate.input, outputPath);
            thumbnail = { path: outputPath, source: candidate.source };
            break;
        } catch (error) {
            console.error(`[Indexer] Could not write ${candidate.source} thumbnail for ${job.filepath}:`, error);
        }
    }

    return {
        mtimeMs,
        size: stat.size,
        unchanged: false,
        hash,
        geometry,
        printMeta,
        readme: sidecars.readme,
        license: printMeta?.license ?? sidecars.license,
        sourceSite: sidecars.sourceSite,
        sourceUrl: sidecars.sourceUrl,
        thumbnail,
    };
}

port.on('message', (event) => {
    const message = event.data as WorkerRequest;

    if (message.type === 'shutdown') {
        process.exit(0);
    }

    if (message.type === 'analyze') {
        const { job } = message;
        analyze(job)
            .then((data) => post({ type: 'result', id: job.id, modelId: job.modelId, ok: true, data }))
            .catch((error: unknown) => {
                const text = error instanceof Error ? error.message : String(error);
                post({ type: 'result', id: job.id, modelId: job.modelId, ok: false, error: text });
            });
    }
});

post({ type: 'ready' });
