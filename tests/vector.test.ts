import { describe, expect, it } from 'vitest';
import { cosineSimilarity, deserializeVector, embeddingText, parseEmbeddingsResponse, serializeVector } from '../electron/ai/vector';

describe('cosineSimilarity', () => {
    it('is 1 for identical direction, 0 for orthogonal, -1 for opposite', () => {
        expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1, 6);
        expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
        expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
    });
    it('guards empty, mismatched and zero vectors', () => {
        expect(cosineSimilarity([], [])).toBe(0);
        expect(cosineSimilarity([1, 2], [1])).toBe(0);
        expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    });
});

describe('vector BLOB round-trip', () => {
    it('serialises and reads back Float32 values', () => {
        const v = [0.5, -1.25, 3, 0, 42.75];
        const back = deserializeVector(serializeVector(v));
        expect(Array.from(back)).toEqual(v);
    });
    it('stays correct at a non-zero buffer offset', () => {
        const buf = serializeVector([1, 2, 3]);
        const shifted = Buffer.concat([Buffer.from([0, 0, 0]), buf]).subarray(3); // force byteOffset 3
        expect(Array.from(deserializeVector(shifted))).toEqual([1, 2, 3]);
    });
});

describe('parseEmbeddingsResponse', () => {
    it('reads the OpenAI shape and honours index order', () => {
        const json = { data: [{ index: 1, embedding: [3, 4] }, { index: 0, embedding: [1, 2] }] };
        expect(parseEmbeddingsResponse(json)).toEqual([[1, 2], [3, 4]]);
    });
    it('reads the Ollama shape', () => {
        expect(parseEmbeddingsResponse({ embeddings: [[1, 2], [3, 4]] })).toEqual([[1, 2], [3, 4]]);
    });
    it('returns [] for anything else', () => {
        expect(parseEmbeddingsResponse(null)).toEqual([]);
        expect(parseEmbeddingsResponse({ nope: true })).toEqual([]);
    });
});

describe('embeddingText', () => {
    it('prefers the AI description and includes names/keywords', () => {
        const text = embeddingText({
            filename: 'dragon.stl',
            displayName: 'Ender Dragon',
            folderPath: 'minis/dragons',
            aiMetadata: { name: 'Ender Dragon Statue', summary: 'A display dragon.', category: 'figurine', keywords: ['dragon', 'ejderha'] },
        });
        expect(text).toContain('Ender Dragon Statue');
        expect(text).toContain('ejderha');
        expect(text).toContain('minis/dragons');
    });
    it('falls back to the filename when there is no AI metadata', () => {
        expect(embeddingText({ filename: 'part.stl' })).toBe('part.stl');
    });
});
