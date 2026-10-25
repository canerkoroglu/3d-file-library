import type { MeshNode } from './meshTransfer';

/** Formats the mesh worker can parse. '3mf-parts' is the regex-based multi-part 3MF parser. */
export type WorkerFormat = 'stl' | 'obj' | 'step' | '3mf-parts';

export interface MeshWorkerRequest {
    id: number;
    url: string;
    format: WorkerFormat;
}

export type MeshWorkerResponse =
    | { id: number; ok: true; node: MeshNode }
    | { id: number; ok: false; error: string };
