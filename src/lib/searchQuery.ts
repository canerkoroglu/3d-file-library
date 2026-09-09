/**
 * Parses the search box text into free-text terms plus structured filters.
 *
 * Supported operators (case-insensitive, values may be quoted):
 *   tag:printed           model has the tag (repeatable, all must match)
 *   type:stl|3mf|obj      file type (repeatable, any may match)
 *   source:printables     source site from metadata
 *   author:name           author from metadata
 *   license:cc-by         license from metadata
 *   tris:>100k tris:<2m   triangle count bounds (k / m suffixes allowed)
 *   size:<50 size:>200    largest bounding-box dimension in mm
 *   has:thumbnail         only models with a thumbnail
 *   has:readme            only models with a README beside them
 *   is:missing            files that cannot be found on disk (deleted or drive disconnected)
 *   is:available          the opposite: files that are present
 *   category:kitchen      category assigned by the AI assistant (substring match)
 *   added:>7d added:<2026-01-01   when the model was added: after/before a date or a relative age (d, w, m, y)
 *   modified:>2w          same for the file's modification time
 *
 * Everything else is treated as free text.
 */
export interface ParsedQuery {
    /** Free-text portion, whitespace-normalised. */
    text: string;
    /** Free-text terms, quotes removed. */
    terms: string[];
    tags: string[];
    fileTypes: string[];
    source?: string;
    author?: string;
    license?: string;
    minTriangles?: number;
    maxTriangles?: number;
    minSizeMm?: number;
    maxSizeMm?: number;
    hasThumbnail?: boolean;
    hasReadme?: boolean;
    /** true = only missing files, false = only available files. */
    missing?: boolean;
    category?: string;
    /** ISO timestamps derived from added:/modified: bounds. */
    addedAfter?: string;
    addedBefore?: string;
    modifiedAfter?: string;
    modifiedBefore?: string;
}

const OPERATORS = new Set(['tag', 'type', 'source', 'author', 'license', 'tris', 'size', 'has', 'is', 'category', 'added', 'modified']);

/**
 * Parses a date bound: an ISO date (2026-08-01) or a relative age (7d, 2w, 3m, 1y) counted back from `now`.
 * Returns an ISO timestamp, or undefined when unreadable.
 */
export function parseDateBound(raw: string, now: Date): string | undefined {
    const value = raw.trim().toLowerCase();
    const relative = value.match(/^(\d+(?:\.\d+)?)\s*(d|w|m|y|day|days|week|weeks|month|months|year|years)$/);
    if (relative) {
        const amount = parseFloat(relative[1]);
        const unit = relative[2][0];
        const date = new Date(now.getTime());
        if (unit === 'd') date.setUTCDate(date.getUTCDate() - amount);
        else if (unit === 'w') date.setUTCDate(date.getUTCDate() - amount * 7);
        else if (unit === 'm') date.setUTCMonth(date.getUTCMonth() - amount);
        else date.setUTCFullYear(date.getUTCFullYear() - amount);
        return date.toISOString();
    }
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(value)) {
        const date = new Date(value.length === 7 ? `${value}-01T00:00:00Z` : `${value}T00:00:00Z`);
        return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }
    return undefined;
}

interface Token {
    key?: string;
    value: string;
}

/** Splits on whitespace while keeping quoted strings (and quoted operator values) together. */
export function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const n = input.length;

    while (i < n) {
        while (i < n && /\s/.test(input[i])) i++;
        if (i >= n) break;

        let key: string | undefined;
        let value = '';

        const readQuoted = (): string => {
            const quote = input[i];
            i++; // opening quote
            let out = '';
            while (i < n && input[i] !== quote) {
                out += input[i];
                i++;
            }
            i++; // closing quote (or end)
            return out;
        };

        if (input[i] === '"' || input[i] === "'") {
            value = readQuoted();
        } else {
            let word = '';
            while (i < n && !/\s/.test(input[i])) {
                if (input[i] === ':' && key === undefined && OPERATORS.has(word.toLowerCase())) {
                    key = word.toLowerCase();
                    word = '';
                    i++;
                    if (input[i] === '"' || input[i] === "'") {
                        word = readQuoted();
                        break;
                    }
                    continue;
                }
                word += input[i];
                i++;
            }
            value = word;
        }

        if (key !== undefined && value === '') {
            // "tag:" with no value -> treat as plain text
            tokens.push({ value: `${key}:` });
        } else {
            tokens.push({ key, value });
        }
    }

    return tokens;
}

function parseNumber(raw: string): number | undefined {
    const match = raw.trim().toLowerCase().match(/^([\d.]+)\s*(k|m)?$/);
    if (!match) return undefined;
    const base = parseFloat(match[1]);
    if (Number.isNaN(base)) return undefined;
    const factor = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
    return Math.round(base * factor);
}

function parseBound(raw: string): { op: '>' | '<' | '='; value: number } | undefined {
    const match = raw.trim().match(/^(>=|<=|>|<|=)?\s*(.+)$/);
    if (!match) return undefined;
    const value = parseNumber(match[2].replace(/mm$/i, ''));
    if (value === undefined) return undefined;
    const opRaw = match[1] || '=';
    const op = opRaw.startsWith('>') ? '>' : opRaw.startsWith('<') ? '<' : '=';
    return { op, value };
}

export function parseSearchQuery(raw: string, options: { now?: Date } = {}): ParsedQuery {
    const result: ParsedQuery = { text: '', terms: [], tags: [], fileTypes: [] };
    if (!raw || !raw.trim()) return result;
    const now = options.now ?? new Date();

    // "added:>7d" means newer than a week (created after the cutoff); "added:<7d" means older.
    const dateBound = (value: string): { after?: string; before?: string } | null => {
        const match = value.trim().match(/^(>=|<=|>|<)?\s*(.+)$/);
        if (!match) return null;
        const iso = parseDateBound(match[2], now);
        if (!iso) return null;
        const op = match[1] ?? '>';
        return op.startsWith('<') ? { before: iso } : { after: iso };
    };

    const terms: string[] = [];

    for (const token of tokenize(raw)) {
        const value = token.value.trim();
        if (!value) continue;

        switch (token.key) {
            case 'tag':
                result.tags.push(value.toLowerCase());
                break;
            case 'type': {
                const type = value.toLowerCase().replace(/^\./, '');
                if (['stl', '3mf', 'obj'].includes(type)) result.fileTypes.push(type);
                break;
            }
            case 'source':
                result.source = value;
                break;
            case 'author':
                result.author = value;
                break;
            case 'license':
                result.license = value;
                break;
            case 'tris': {
                const bound = parseBound(value);
                if (!bound) break;
                if (bound.op === '>') result.minTriangles = bound.value;
                else if (bound.op === '<') result.maxTriangles = bound.value;
                else {
                    result.minTriangles = bound.value;
                    result.maxTriangles = bound.value;
                }
                break;
            }
            case 'size': {
                const bound = parseBound(value);
                if (!bound) break;
                if (bound.op === '>') result.minSizeMm = bound.value;
                else if (bound.op === '<') result.maxSizeMm = bound.value;
                else {
                    result.minSizeMm = bound.value;
                    result.maxSizeMm = bound.value;
                }
                break;
            }
            case 'has': {
                const what = value.toLowerCase();
                if (what === 'thumbnail' || what === 'thumb') result.hasThumbnail = true;
                if (what === 'readme') result.hasReadme = true;
                break;
            }
            case 'is': {
                const what = value.toLowerCase();
                if (what === 'missing' || what === 'offline') result.missing = true;
                if (what === 'available' || what === 'online' || what === 'present') result.missing = false;
                break;
            }
            case 'category':
                result.category = value;
                break;
            case 'added': {
                const bound = dateBound(value);
                if (bound?.after) result.addedAfter = bound.after;
                if (bound?.before) result.addedBefore = bound.before;
                break;
            }
            case 'modified': {
                const bound = dateBound(value);
                if (bound?.after) result.modifiedAfter = bound.after;
                if (bound?.before) result.modifiedBefore = bound.before;
                break;
            }
            default:
                terms.push(value);
        }
    }

    result.terms = terms;
    result.text = terms.join(' ');
    return result;
}

/**
 * Builds an FTS5 MATCH expression for the trigram tokenizer.
 * Terms shorter than three characters cannot be matched by trigrams and are
 * returned separately so the caller can fall back to LIKE for them.
 */
export function buildFtsMatch(terms: string[]): { match: string | null; shortTerms: string[] } {
    const ftsTerms: string[] = [];
    const shortTerms: string[] = [];

    for (const term of terms) {
        const cleaned = term.trim();
        if (!cleaned) continue;
        if ([...cleaned].length < 3) {
            shortTerms.push(cleaned);
        } else {
            ftsTerms.push(`"${cleaned.replace(/"/g, '""')}"`);
        }
    }

    return {
        match: ftsTerms.length > 0 ? ftsTerms.join(' AND ') : null,
        shortTerms,
    };
}
