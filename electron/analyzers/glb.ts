/**
 * Geometry stats for glTF/GLB, computed from the glTF JSON alone — accessors carry vertex
 * counts and the POSITION min/max, so no buffers need to be read and no 3D library is loaded.
 * Note: glTF coordinates are model-defined (often metres/unitless), so the bounding box is not
 * guaranteed to be millimetres like the print formats; the triangle count is unit-independent.
 * Volume is left null (it would need the actual vertex data).
 */
import fs from 'fs';
import type { GeometryStats } from './types';

interface Accessor {
    count?: number;
    min?: number[];
    max?: number[];
}
interface Primitive {
    mode?: number;
    indices?: number;
    attributes?: Record<string, number>;
}
interface Gltf {
    meshes?: Array<{ primitives?: Primitive[] }>;
    accessors?: Accessor[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON"

/** Returns the glTF document from a .glb container or a plain .gltf JSON file. */
function extractGltf(buffer: Buffer, isBinary: boolean): Gltf | null {
    if (!isBinary) {
        try {
            return JSON.parse(buffer.toString('utf8')) as Gltf;
        } catch {
            return null;
        }
    }
    if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) return null;
    // Walk the chunk list for the JSON chunk (chunk 0 per spec; be defensive anyway).
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const chunkLength = buffer.readUInt32LE(offset);
        const chunkType = buffer.readUInt32LE(offset + 4);
        const start = offset + 8;
        if (chunkType === JSON_CHUNK_TYPE) {
            try {
                return JSON.parse(buffer.toString('utf8', start, start + chunkLength)) as Gltf;
            } catch {
                return null;
            }
        }
        offset = start + chunkLength;
    }
    return null;
}

function statsFromGltf(gltf: Gltf): GeometryStats | null {
    const accessors = gltf.accessors ?? [];
    let triangles = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let haveBounds = false;

    for (const mesh of gltf.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
            if ((primitive.mode ?? 4) !== 4) continue; // count TRIANGLES only (skip points/lines/strips)
            const posIndex = primitive.attributes?.POSITION;
            const vertexCount = primitive.indices != null ? accessors[primitive.indices]?.count : posIndex != null ? accessors[posIndex]?.count : undefined;
            if (vertexCount) triangles += Math.floor(vertexCount / 3);

            if (posIndex != null) {
                const pos = accessors[posIndex];
                if (pos?.min && pos.max && pos.min.length >= 3 && pos.max.length >= 3) {
                    minX = Math.min(minX, pos.min[0]); minY = Math.min(minY, pos.min[1]); minZ = Math.min(minZ, pos.min[2]);
                    maxX = Math.max(maxX, pos.max[0]); maxY = Math.max(maxY, pos.max[1]); maxZ = Math.max(maxZ, pos.max[2]);
                    haveBounds = true;
                }
            }
        }
    }

    if (triangles === 0 && !haveBounds) return null;
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return {
        triangleCount: triangles,
        bbox: haveBounds ? { x: round(maxX - minX), y: round(maxY - minY), z: round(maxZ - minZ) } : { x: 0, y: 0, z: 0 },
        volume: null,
    };
}

export async function analyzeGlb(filepath: string): Promise<GeometryStats | null> {
    const buffer = await fs.promises.readFile(filepath);
    const gltf = extractGltf(buffer, filepath.toLowerCase().endsWith('.glb'));
    return gltf ? statsFromGltf(gltf) : null;
}
