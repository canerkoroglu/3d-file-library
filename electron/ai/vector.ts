/**
 * Pure vector helpers for semantic ("find similar") search — no Electron or DB imports, so they
 * can be unit-tested directly. Vectors are stored as little-endian Float32 BLOBs in SQLite.
 */

export interface EmbeddingSource {
    displayName?: string | null;
    filename: string;
    folderPath?: string | null;
    aiMetadata?: { name?: string; summary?: string; category?: string; keywords?: string[] } | null;
}

/** Builds the text that represents a model for embedding: its AI description if present, else its names/paths. */
export function embeddingText(model: EmbeddingSource): string {
    const ai = model.aiMetadata ?? undefined;
    const parts = [
        model.displayName || model.filename,
        model.folderPath ?? '',
        ai?.name ?? '',
        ai?.summary ?? '',
        ai?.category ?? '',
        ...(ai?.keywords ?? []),
    ];
    return parts.map((p) => p.trim()).filter(Boolean).join('\n').slice(0, 2000);
}

/** Normalises both OpenAI (`data[].embedding`, possibly out of order via `index`) and Ollama (`embeddings[]`) shapes. */
export function parseEmbeddingsResponse(json: unknown): number[][] {
    if (!json || typeof json !== 'object') return [];
    const obj = json as { data?: Array<{ embedding?: number[]; index?: number }>; embeddings?: number[][] };
    if (Array.isArray(obj.embeddings)) return obj.embeddings.filter((v): v is number[] => Array.isArray(v));
    if (Array.isArray(obj.data)) {
        const out: number[][] = [];
        obj.data.forEach((d, i) => {
            if (Array.isArray(d.embedding)) out[typeof d.index === 'number' ? d.index : i] = d.embedding;
        });
        return out;
    }
    return [];
}

/** Little-endian Float32 bytes for BLOB storage. */
export function serializeVector(vector: number[]): Buffer {
    const floats = Float32Array.from(vector);
    return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
}

/** Reads a Float32 BLOB back, copying into an aligned buffer first. */
export function deserializeVector(bytes: Uint8Array): Float32Array {
    const aligned = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(aligned).set(bytes);
    return new Float32Array(aligned);
}

/** Cosine similarity in [-1, 1]; 0 when either vector is empty, mismatched, or zero-length. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
    if (a.length === 0 || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
