import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

/** Stands in for Electron's utility process: records messages and lets the test decide what happens. */
class FakeWorker extends EventEmitter {
    sent: Array<{ type: string; job?: { id: number; modelId: number } }> = [];
    killed = false;
    postMessage(message: { type: string; job?: { id: number; modelId: number } }): void {
        this.sent.push(message);
    }
    kill(): boolean {
        this.killed = true;
        queueMicrotask(() => this.emit('exit', null));
        return true;
    }
}

const workers: FakeWorker[] = [];
vi.mock('electron', () => ({
    utilityProcess: {
        fork: () => {
            const worker = new FakeWorker();
            workers.push(worker);
            return worker;
        },
    },
}));
vi.mock('better-sqlite3', async () => ({ default: (await import('./helpers/sqliteShim')).default }));

const { initDatabase, closeDatabase } = await import('../electron/database');
const { setUserDataDir } = await import('../electron/paths');
const library = await import('../electron/library');
const indexer = await import('../electron/indexer');

let dir: string;
const notices: Array<{ title: string }> = [];
library.libraryEvents.on('notice', (notice) => notices.push(notice));

function addModel(name: string): number {
    const file = path.join(dir, name);
    fs.writeFileSync(file, 'solid x\nendsolid x\n');
    return library.importModel(file, null)!.id;
}

function current(): FakeWorker {
    return workers[workers.length - 1];
}

function jobsSentTo(worker: FakeWorker) {
    return worker.sent.filter((m) => m.type === 'analyze').map((m) => m.job!);
}

beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelist-indexer-'));
    setUserDataDir(dir);
    initDatabase(':memory:');
    notices.length = 0;
    indexer.startIndexer({ onProgress: () => {}, onModelIndexed: () => {}, getThumbnailQueueSize: () => 0 });
    current().emit('message', { type: 'ready' });
});

afterEach(() => {
    indexer.stopIndexer();
    closeDatabase();
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('indexer robustness', () => {
    it('restarts a hung worker and reports the file that timed out', async () => {
        const id = addModel('hangs.stl');
        indexer.enqueueModel(id);
        const worker = current();
        expect(jobsSentTo(worker).map((j) => j.modelId)).toEqual([id]);

        await vi.advanceTimersByTimeAsync(61_000);
        expect(worker.killed).toBe(true);
        expect(notices.map((n) => n.title)).toEqual(['1 file could not be analysed']);
        // Nothing left to do, so no replacement worker is started.
        expect(workers.at(-1)).toBe(worker);
    });

    it('gives up on a file that keeps crashing the worker instead of looping forever', async () => {
        const id = addModel('crashes.stl');
        indexer.enqueueModel(id);

        // First crash: the job is retried on a fresh worker.
        current().emit('exit', 1);
        await vi.advanceTimersByTimeAsync(1_000);
        current().emit('message', { type: 'ready' });
        expect(jobsSentTo(current()).map((j) => j.modelId)).toEqual([id]);

        // Second crash: reported as failed, not retried.
        const second = current();
        second.emit('exit', 1);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(current()).toBe(second);
        expect(notices.map((n) => n.title)).toEqual(['1 file could not be analysed']);
    });

    it('ignores a late answer for a job that already timed out', async () => {
        const id = addModel('slow.stl');
        indexer.enqueueModel(id);
        const worker = current();
        const [job] = jobsSentTo(worker);
        await vi.advanceTimersByTimeAsync(61_000);

        expect(() =>
            worker.emit('message', { type: 'result', id: job.id, modelId: id, ok: false, error: 'late' }),
        ).not.toThrow();
        expect(indexer.getProgress().failed).toBe(0);
    });
});
