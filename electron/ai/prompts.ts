/**
 * Prompt construction and response validation for the AI assistant. Pure functions,
 * so they can be unit-tested without a model. Written for small local instruction
 * models (Qwen3 8B class): short system prompts, explicit JSON shapes, no reasoning
 * ("/no_think" is Qwen3's soft switch to skip its thinking block).
 */
import { AI_CATEGORIES } from '../../src/lib/aiCategories';
import type { AiEnrichment, QueryTranslation } from '../../src/types';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface EnrichmentInput {
    filename: string;
    /** Folder path relative to the watched folder, machine-specific prefix removed. */
    folder: string;
    fileType: string;
    dimensionsMm?: { x: number; y: number; z: number };
    triangleCount?: number;
    title?: string;
    designer?: string;
    description?: string;
    source?: string;
    readmeExcerpt?: string;
    existingTags: string[];
}

const README_EXCERPT_CHARS = 900;
const MAX_KEYWORDS = 8;

function clip(text: string | undefined, max: number): string | undefined {
    if (!text) return undefined;
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function buildEnrichmentMessages(input: EnrichmentInput): ChatMessage[] {
    const lines = [
        `Filename: ${input.filename}`,
        `Folder: ${input.folder || '(library root)'}`,
        `File type: ${input.fileType.toUpperCase()}`,
    ];
    if (input.dimensionsMm) lines.push(`Size: ${input.dimensionsMm.x} × ${input.dimensionsMm.y} × ${input.dimensionsMm.z} mm`);
    if (input.triangleCount !== undefined) lines.push(`Triangles: ${input.triangleCount}`);
    if (input.title) lines.push(`Title from file: ${clip(input.title, 120)}`);
    if (input.designer) lines.push(`Designer: ${clip(input.designer, 80)}`);
    if (input.description) lines.push(`Description from file: ${clip(input.description, 400)}`);
    if (input.source) lines.push(`Downloaded from: ${input.source}`);
    if (input.readmeExcerpt) lines.push(`README excerpt: ${clip(input.readmeExcerpt, README_EXCERPT_CHARS)}`);
    lines.push(`Existing tags you may suggest: ${input.existingTags.length > 0 ? input.existingTags.join(', ') : '(none)'}`);

    return [
        {
            role: 'system',
            content: [
                'You catalogue 3D printing files. From the details given, describe what the object most likely is.',
                'Reply with a single JSON object and nothing else:',
                '{"name": "short clean name, at most 6 words, no version numbers or file junk",',
                ' "summary": "one sentence, at most 25 words, what it is and what it is for",',
                ` "category": one of [${AI_CATEGORIES.map((c) => `"${c}"`).join(', ')}],`,
                ' "keywords": ["3 to 8 lowercase search words: synonyms, parts, purpose, room, franchise"],',
                ' "suggestedTags": ["only names from the existing tags list that clearly apply, else empty"]}',
                'Do not invent facts that the details do not support. If unsure, say so briefly in the summary and use category "other".',
                'If the filename or description is not in English, include the original-language words in keywords alongside their English equivalents (e.g. Turkish and English).',
                '/no_think',
            ].join('\n'),
        },
        { role: 'user', content: `${lines.join('\n')}\n/no_think` },
    ];
}

function asStringArray(value: unknown, max: number): string[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of value) {
        if (typeof item !== 'string') continue;
        const clean = item.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!clean || clean.length > 40 || seen.has(clean)) continue;
        seen.add(clean);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out;
}

/** Normalises and validates a model reply; throws when it is not usable. */
export function parseEnrichment(raw: unknown, existingTags: string[], model: string): AiEnrichment {
    if (!raw || typeof raw !== 'object') throw new Error('The assistant did not return a JSON object');
    const data = raw as Record<string, unknown>;

    const summary = typeof data.summary === 'string' ? data.summary.replace(/\s+/g, ' ').trim() : '';
    if (!summary) throw new Error('The assistant did not return a summary');

    const name = typeof data.name === 'string' ? data.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const categoryRaw = typeof data.category === 'string' ? data.category.trim().toLowerCase() : '';
    const category = (AI_CATEGORIES as readonly string[]).find((c) => c === categoryRaw)
        ?? (AI_CATEGORIES as readonly string[]).find((c) => categoryRaw && (c.includes(categoryRaw) || categoryRaw.includes(c.split(' ')[0])))
        ?? 'other';

    const byLower = new Map(existingTags.map((t) => [t.toLowerCase(), t]));
    const suggestedTags = asStringArray(data.suggestedTags, 10)
        .map((t) => byLower.get(t))
        .filter((t): t is string => Boolean(t));

    return {
        name: name || summary.split(/[.,;:]/)[0].slice(0, 60),
        summary: summary.slice(0, 300),
        category,
        keywords: asStringArray(data.keywords, MAX_KEYWORDS),
        suggestedTags: [...new Set(suggestedTags)],
        model,
        generatedAt: new Date().toISOString(),
    };
}

export interface TranslationContext {
    tags: string[];
    /** Categories that actually occur in the library, so the model prefers them. */
    categories: string[];
    /** Today's date, ISO (YYYY-MM-DD), for relative dates. */
    today: string;
}

export function buildTranslationMessages(text: string, context: TranslationContext): ChatMessage[] {
    return [
        {
            role: 'system',
            content: [
                'You translate a person\'s request into the search syntax of a 3D model library. Reply with a single JSON object and nothing else:',
                '{"query": "the search string", "explanation": "at most 12 words"}',
                '',
                'Search syntax (combine freely, all parts must match):',
                '- plain words: matched against names, folders, notes, READMEs and AI keywords; keep them few and specific; use "quotes" for exact phrases',
                '- tag:NAME  (only these tags exist: ' + (context.tags.length > 0 ? context.tags.map((t) => `"${t}"`).join(', ') : 'none') + ')',
                '- type:stl | type:3mf | type:obj',
                '- category:NAME  (categories in use: ' + (context.categories.length > 0 ? context.categories.join(', ') : 'none yet') + ')',
                '- source:SITE (thingiverse, printables, myminifactory, cults3d, thangs, makerworld)   author:NAME   license:TEXT',
                '- tris:>100k  tris:<5000  (triangle count)   size:<50  size:>200  (largest dimension in mm; 10 cm = 100)',
                `- added:>7d = added within the last 7 days; added:>1m = within the last month; added:<2026-01-01 = added before that date (units d, w, m, y; today is ${context.today})`,
                '- modified:>2w = file changed within the last two weeks (same rules as added:)',
                '- has:readme  has:thumbnail  is:missing  is:available',
                '',
                'Rules:',
                '- Always keep the subject of the request as plain words (what the thing is); operators only narrow it down.',
                '- The request may be in Turkish or English; keep the subject word as written (model keywords are stored bilingually, so it matches either way).',
                '- Recent / last N days / this week / this month → added:>… with >, never <. "older than" → <.',
                '- Never invent tags that are not in the list; "printed" means tag:Printed only if that tag exists, otherwise use the plain word.',
                '- Use category: only when the person names a category that is in use; plain words already match categories.',
                '- small = size:<50, large or big = size:>150; detailed or high-poly = tris:>200k; low-poly = tris:<5000.',
                '- If the request is already in the syntax, return it unchanged.',
                '',
                'Examples:',
                '"small printed dragons from last month" → {"query": "dragon tag:Printed size:<50 added:>1m", "explanation": "printed dragons under 50 mm, last month"}',
                '"kitchen stuff bigger than 10 cm" → {"query": "kitchen size:>100", "explanation": "kitchen items over 100 mm"}',
                '"stl files I added this week" → {"query": "type:stl added:>7d", "explanation": "STL files from the last 7 days"}',
                '"highly detailed miniatures" → {"query": "miniature tris:>200k", "explanation": "miniatures with many triangles"}',
                '"geçen ay eklediğim küçük ejderhalar" → {"query": "ejderha size:<50 added:>1m", "explanation": "small dragons added last month"}',
                '/no_think',
            ].join('\n'),
        },
        { role: 'user', content: `Request: ${text.trim()}\n/no_think` },
    ];
}

export function parseTranslation(raw: unknown, input: string, model: string): QueryTranslation {
    if (!raw || typeof raw !== 'object') throw new Error('The assistant did not return a JSON object');
    const data = raw as Record<string, unknown>;
    const query = typeof data.query === 'string' ? data.query.replace(/\s+/g, ' ').trim() : '';
    if (!query) throw new Error('The assistant did not return a query');
    const explanation = typeof data.explanation === 'string' ? data.explanation.trim().slice(0, 160) : undefined;
    return { input, query: query.slice(0, 300), explanation, model };
}
