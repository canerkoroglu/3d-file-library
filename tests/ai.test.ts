import { describe, expect, it } from 'vitest';
import { buildEnrichmentMessages, buildTranslationMessages, parseEnrichment, parseTranslation } from '../electron/ai/prompts';
import { parseDateBound, parseSearchQuery } from '../src/lib/searchQuery';

describe('enrichment prompt', () => {
    it('includes the facts we know and the tag vocabulary', () => {
        const messages = buildEnrichmentMessages({
            filename: 'dragon_body.stl',
            folder: 'dragon/files',
            fileType: 'stl',
            dimensionsMm: { x: 40, y: 40, z: 60 },
            triangleCount: 6,
            source: 'Thingiverse',
            readmeExcerpt: 'Articulated dragon by Test Designer.',
            existingTags: ['Printed', 'Draft'],
        });
        expect(messages[0].role).toBe('system');
        expect(messages[0].content).toContain('"category": one of [');
        expect(messages[1].content).toContain('Filename: dragon_body.stl');
        expect(messages[1].content).toContain('Size: 40 × 40 × 60 mm');
        expect(messages[1].content).toContain('Existing tags you may suggest: Printed, Draft');
        expect(messages[1].content).toContain('/no_think');
    });
});

describe('parseEnrichment', () => {
    it('normalises a good reply', () => {
        const result = parseEnrichment(
            { name: '  Dragon body ', summary: 'Body segment of an articulated dragon toy.', category: 'Toy or Game', keywords: ['Dragon', 'articulated', 'dragon', 'toy'], suggestedTags: ['printed', 'Nonexistent'] },
            ['Printed', 'Draft'],
            'qwen3:8b',
        );
        expect(result.name).toBe('Dragon body');
        expect(result.category).toBe('toy or game');
        expect(result.keywords).toEqual(['dragon', 'articulated', 'toy']);
        expect(result.suggestedTags).toEqual(['Printed']);
        expect(result.model).toBe('qwen3:8b');
        expect(result.generatedAt).toMatch(/^\d{4}-/);
    });

    it('falls back to "other" for unknown categories and derives a name from the summary', () => {
        const result = parseEnrichment({ summary: 'A widget of unclear purpose, possibly decorative.', category: 'gadget' }, [], 'm');
        expect(result.category).toBe('other');
        expect(result.name).toBe('A widget of unclear purpose');
        expect(result.keywords).toEqual([]);
        expect(result.suggestedTags).toEqual([]);
    });

    it('rejects replies without a summary', () => {
        expect(() => parseEnrichment({ category: 'tool' }, [], 'm')).toThrow(/summary/);
        expect(() => parseEnrichment('nope', [], 'm')).toThrow(/JSON/);
    });
});

describe('translation prompt', () => {
    it('lists the real tags, categories and today\'s date', () => {
        const messages = buildTranslationMessages('dragons I printed last month', { tags: ['Printed'], categories: ['figurine'], today: '2026-09-09' });
        expect(messages[0].content).toContain('"Printed"');
        expect(messages[0].content).toContain('categories in use: figurine');
        expect(messages[0].content).toContain('today is 2026-09-09');
        expect(messages[1].content).toContain('Request: dragons I printed last month');
    });

    it('parses the reply', () => {
        expect(parseTranslation({ query: ' dragon  tag:Printed added:>1m ', explanation: 'printed dragons from the last month' }, 'x', 'm'))
            .toEqual({ input: 'x', query: 'dragon tag:Printed added:>1m', explanation: 'printed dragons from the last month', model: 'm' });
        expect(() => parseTranslation({ explanation: 'nothing' }, 'x', 'm')).toThrow(/query/);
    });
});

describe('date operators', () => {
    const now = new Date('2026-09-09T12:00:00Z');

    it('understands relative ages and ISO dates', () => {
        expect(parseDateBound('7d', now)).toBe('2026-09-02T12:00:00.000Z');
        expect(parseDateBound('2w', now)).toBe('2026-08-26T12:00:00.000Z');
        expect(parseDateBound('1m', now)).toBe('2026-08-09T12:00:00.000Z');
        expect(parseDateBound('1y', now)).toBe('2025-09-09T12:00:00.000Z');
        expect(parseDateBound('2026-08', now)).toBe('2026-08-01T00:00:00.000Z');
        expect(parseDateBound('2026-08-15', now)).toBe('2026-08-15T00:00:00.000Z');
        expect(parseDateBound('yesterday', now)).toBeUndefined();
    });

    it('maps > to "after" and < to "before"', () => {
        const q = parseSearchQuery('added:>7d modified:<2026-01-01 category:kitchen', { now });
        expect(q.addedAfter).toBe('2026-09-02T12:00:00.000Z');
        expect(q.modifiedBefore).toBe('2026-01-01T00:00:00.000Z');
        expect(q.category).toBe('kitchen');
        expect(parseSearchQuery('added:2026-08', { now }).addedAfter).toBe('2026-08-01T00:00:00.000Z');
    });
});
