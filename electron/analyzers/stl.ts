import fs from 'fs';
import readline from 'readline';
import { GeometryAccumulator } from './geometry';
import type { GeometryStats } from './types';

const BINARY_HEADER = 80;
const TRIANGLE_BYTES = 50;
const CHUNK_TRIANGLES = 20_000;

/**
 * Decides whether the file is binary STL. ASCII files start with "solid" but
 * some binary exporters also write that word, so the declared triangle count is
 * checked against the file size.
 */
export async function isBinaryStl(filepath: string, size: number): Promise<boolean> {
    if (size < BINARY_HEADER + 4) return false;
    const fd = await fs.promises.open(filepath, 'r');
    try {
        const header = Buffer.alloc(BINARY_HEADER + 4);
        await fd.read(header, 0, header.length, 0);
        const count = header.readUInt32LE(BINARY_HEADER);
        if (BINARY_HEADER + 4 + count * TRIANGLE_BYTES === size) return true;
        const start = header.subarray(0, 5).toString('ascii').toLowerCase();
        return start !== 'solid';
    } finally {
        await fd.close();
    }
}

async function analyzeBinary(filepath: string, size: number): Promise<GeometryStats | null> {
    const fd = await fs.promises.open(filepath, 'r');
    try {
        const header = Buffer.alloc(BINARY_HEADER + 4);
        await fd.read(header, 0, header.length, 0);
        const declared = header.readUInt32LE(BINARY_HEADER);
        const available = Math.floor((size - BINARY_HEADER - 4) / TRIANGLE_BYTES);
        const count = Math.min(declared, available);

        const acc = new GeometryAccumulator();
        const chunk = Buffer.alloc(CHUNK_TRIANGLES * TRIANGLE_BYTES);
        let position = BINARY_HEADER + 4;
        let remaining = count;

        while (remaining > 0) {
            const toRead = Math.min(remaining, CHUNK_TRIANGLES);
            const { bytesRead } = await fd.read(chunk, 0, toRead * TRIANGLE_BYTES, position);
            const triangles = Math.floor(bytesRead / TRIANGLE_BYTES);
            if (triangles === 0) break;

            for (let i = 0; i < triangles; i++) {
                const base = i * TRIANGLE_BYTES + 12; // skip the normal vector
                acc.addTriangle(
                    chunk.readFloatLE(base), chunk.readFloatLE(base + 4), chunk.readFloatLE(base + 8),
                    chunk.readFloatLE(base + 12), chunk.readFloatLE(base + 16), chunk.readFloatLE(base + 20),
                    chunk.readFloatLE(base + 24), chunk.readFloatLE(base + 28), chunk.readFloatLE(base + 32),
                );
            }

            position += bytesRead;
            remaining -= triangles;
        }

        return acc.result();
    } finally {
        await fd.close();
    }
}

async function analyzeAscii(filepath: string): Promise<GeometryStats | null> {
    const acc = new GeometryAccumulator();
    const rl = readline.createInterface({
        input: fs.createReadStream(filepath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });

    const pending: number[] = [];
    for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (!line.startsWith('vertex')) continue;
        const parts = line.split(/\s+/);
        if (parts.length < 4) continue;
        pending.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
        if (pending.length === 9) {
            acc.addTriangle(
                pending[0], pending[1], pending[2],
                pending[3], pending[4], pending[5],
                pending[6], pending[7], pending[8],
            );
            pending.length = 0;
        }
    }

    return acc.result();
}

export async function analyzeStl(filepath: string, size: number): Promise<GeometryStats | null> {
    const binary = await isBinaryStl(filepath, size);
    return binary ? analyzeBinary(filepath, size) : analyzeAscii(filepath);
}
