import { describe, expect, it, vi } from 'vitest';

// provider.ts imports Electron's safeStorage and the settings store; neither is needed for the parsing helpers.
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' } }));
vi.mock('../electron/settings', () => ({ getSetting: (_k: string, fallback: unknown) => fallback, setSetting: () => {} }));

const { extractJson, stripThinking, normaliseBaseUrl } = await import('../electron/ai/provider');

describe('stripThinking', () => {
    it('removes closed and unterminated think blocks', () => {
        expect(stripThinking('<think>\nhmm\n</think>\n{"a":1}')).toBe('{"a":1}');
        expect(stripThinking('{"a":1}<think>trailing')).toBe('{"a":1}');
        expect(stripThinking('plain')).toBe('plain');
    });
});

describe('extractJson', () => {
    it('finds the object inside prose, fences and thinking', () => {
        expect(extractJson('Sure! ```json\n{"query": "dragon tag:Printed"}\n``` Hope this helps.')).toEqual({ query: 'dragon tag:Printed' });
        expect(extractJson('<think>reasoning {not json}</think>{"summary":"a {nested} brace","n":[1,2]}')).toEqual({ summary: 'a {nested} brace', n: [1, 2] });
        expect(extractJson('{"text":"a \\"quoted\\" } brace"} tail')).toEqual({ text: 'a "quoted" } brace' });
    });

    it('returns null when there is no complete object', () => {
        expect(extractJson('no json here')).toBeNull();
        expect(extractJson('{"unterminated": true')).toBeNull();
    });
});

describe('normaliseBaseUrl', () => {
    it('trims whitespace and trailing slashes only', () => {
        expect(normaliseBaseUrl('  http://localhost:11434/v1/ ')).toBe('http://localhost:11434/v1');
        expect(normaliseBaseUrl('https://llm.example.com/v1')).toBe('https://llm.example.com/v1');
    });
});
