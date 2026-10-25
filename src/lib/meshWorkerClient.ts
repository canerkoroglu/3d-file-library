/**
 * Page-side access to the mesh worker. One worker is shared by the viewer and the thumbnail
 * renderer in a window; requests are matched to replies by id.
 */
import type { MeshNode } from './meshTransfer';
import type { MeshWorkerRequest, MeshWorkerResponse, WorkerFormat } from './meshWorkerProtocol';

/** The worker could not start or died; the caller should parse on the page instead. */
export class MeshWorkerUnavailable extends Error {}

let worker: Worker | null = null;
let workerBroken = false;
/** Set once the worker has answered at least once, i.e. it can actually run in this window. */
let workerProvenWorking = false;
let nextId = 1;
const pending = new Map<number, { resolve: (node: MeshNode) => void; reject: (error: Error) => void }>();

function failAll(error: Error): void {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
}

function getWorker(): Worker | null {
    if (worker || workerBroken) return worker;
    try {
        worker = new Worker(new URL('../workers/meshWorker.ts', import.meta.url), { type: 'module', name: 'mesh-parser' });
    } catch (error) {
        console.warn('Mesh worker unavailable; parsing on the page instead:', error);
        workerBroken = true;
        return null;
    }
    worker.onmessage = (event: MessageEvent<MeshWorkerResponse>) => {
        const reply = event.data;
        const entry = pending.get(reply.id);
        workerProvenWorking = true;
        if (!entry) return;
        pending.delete(reply.id);
        if (reply.ok) entry.resolve(reply.node);
        else entry.reject(new Error(reply.error));
    };
    worker.onerror = (event) => {
        // A worker that fails to start (or crashes) is replaced on the next request.
        console.error('Mesh worker error:', event.message);
        event.preventDefault();
        worker?.terminate();
        worker = null;
        // A worker that never answered cannot run here (e.g. blocked by the platform): stop trying.
        if (!workerProvenWorking) workerBroken = true;
        failAll(new MeshWorkerUnavailable(event.message || 'The 3D parser stopped unexpectedly.'));
    };
    return worker;
}

/** True when a worker can be used in this window. */
export function meshWorkerAvailable(): boolean {
    return getWorker() !== null;
}

/** Parses the file at `url` in the worker. Rejects if the worker is unavailable or parsing fails. */
export function parseInWorker(url: string, format: WorkerFormat): Promise<MeshNode> {
    const w = getWorker();
    if (!w) return Promise.reject(new MeshWorkerUnavailable('Mesh worker unavailable'));
    const id = nextId++;
    return new Promise<MeshNode>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const request: MeshWorkerRequest = { id, url, format };
        w.postMessage(request);
    });
}
