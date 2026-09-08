import fs from 'fs';
import readline from 'readline';
import { GeometryAccumulator } from './geometry';
import type { GeometryStats } from './types';

/**
 * Streams a Wavefront OBJ file to collect bounding box and triangle count.
 * Faces with more than three vertices are counted as fan-triangulated.
 * Volume is not computed because it would require keeping every vertex in memory.
 */
export async function analyzeObj(filepath: string): Promise<GeometryStats | null> {
    const acc = new GeometryAccumulator();
    const rl = readline.createInterface({
        input: fs.createReadStream(filepath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });

    for await (const rawLine of rl) {
        if (rawLine.length < 3) continue;
        const c0 = rawLine.charCodeAt(0);
        const c1 = rawLine.charCodeAt(1);

        if (c0 === 118 /* v */ && (c1 === 32 || c1 === 9)) {
            const parts = rawLine.trim().split(/\s+/);
            if (parts.length >= 4) {
                acc.addVertex(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
            }
        } else if (c0 === 102 /* f */ && (c1 === 32 || c1 === 9)) {
            const vertexCount = rawLine.trim().split(/\s+/).length - 1;
            for (let i = 0; i < Math.max(0, vertexCount - 2); i++) acc.countTriangle();
        }
    }

    return acc.result(false);
}
