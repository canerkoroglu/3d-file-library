import { describe, expect, it } from 'vitest';
import { buildFtsMatch, parseSearchQuery, tokenize } from '../src/lib/searchQuery';

describe('tokenize', () => {
    it('splits on whitespace and keeps quoted strings together', () => {
        expect(tokenize('benchy "low poly" hull')).toEqual([
            { key: undefined, value: 'benchy' },
            { key: undefined, value: 'low poly' },
            { key: undefined, value: 'hull' },
        ]);
    });

    it('recognises operators with quoted values', () => {
        expect(tokenize('tag:"print next" type:stl')).toEqual([
            { key: 'tag', value: 'print next' },
            { key: 'type', value: 'stl' },
        ]);
    });

    it('treats unknown prefixes and empty operators as text', () => {
        expect(tokenize('http://x tag:')).toEqual([
            { key: undefined, value: 'http://x' },
            { value: 'tag:' },
        ]);
    });
});

describe('parseSearchQuery', () => {
    it('returns an empty query for blank input', () => {
        expect(parseSearchQuery('   ')).toEqual({ text: '', terms: [], tags: [], fileTypes: [] });
    });

    it('extracts structured filters and free text', () => {
        const q = parseSearchQuery('dragon tag:Printed type:3MF author:"Loot Studios" tris:>100k size:<50mm has:readme');
        expect(q.text).toBe('dragon');
        expect(q.tags).toEqual(['printed']);
        expect(q.fileTypes).toEqual(['3mf']);
        expect(q.author).toBe('Loot Studios');
        expect(q.minTriangles).toBe(100_000);
        expect(q.maxSizeMm).toBe(50);
        expect(q.hasReadme).toBe(true);
    });

    it('supports m suffix, exact matches and lower bounds', () => {
        expect(parseSearchQuery('tris:<1.5m').maxTriangles).toBe(1_500_000);
        expect(parseSearchQuery('tris:250')).toMatchObject({ minTriangles: 250, maxTriangles: 250 });
        expect(parseSearchQuery('size:>=120').minSizeMm).toBe(120);
    });

    it('understands availability filters', () => {
        expect(parseSearchQuery('is:missing').missing).toBe(true);
        expect(parseSearchQuery('is:available').missing).toBe(false);
        expect(parseSearchQuery('is:whatever').missing).toBeUndefined();
    });

    it('ignores invalid file types and numbers', () => {
        const q = parseSearchQuery('type:step tris:many');
        expect(q.fileTypes).toEqual([]);
        expect(q.minTriangles).toBeUndefined();
        expect(q.maxTriangles).toBeUndefined();
    });
});

describe('buildFtsMatch', () => {
    it('quotes terms and joins with AND', () => {
        expect(buildFtsMatch(['benchy', 'hull'])).toEqual({ match: '"benchy" AND "hull"', shortTerms: [] });
    });

    it('escapes embedded quotes', () => {
        expect(buildFtsMatch(['12" wheel']).match).toBe('"12"" wheel"');
    });

    it('routes terms shorter than three characters to the LIKE fallback', () => {
        expect(buildFtsMatch(['v2', 'benchy'])).toEqual({ match: '"benchy"', shortTerms: ['v2'] });
        expect(buildFtsMatch(['v2']).match).toBeNull();
    });
});
