import { describe, expect, it, vi } from 'vitest';

// library.ts pulls in better-sqlite3 through database.ts; stub it so the pure query builder can be tested.
vi.mock('../electron/database', () => ({ getDatabase: () => { throw new Error('not used'); } }));

const { buildModelsQuery } = await import('../electron/library');

describe('buildModelsQuery', () => {
    it('lists everything newest first by default, with missing files last', () => {
        const { sql, params } = buildModelsQuery();
        expect(sql).not.toContain('WHERE');
        expect(sql).toContain('ORDER BY (m.missing_since IS NOT NULL), m.created_at DESC');
        expect(params).toEqual([]);
    });

    it('filters on availability', () => {
        expect(buildModelsQuery({ searchQuery: 'is:missing' }).sql).toContain('WHERE m.missing_since IS NOT NULL');
        expect(buildModelsQuery({ searchQuery: 'is:available' }).sql).toContain('WHERE m.missing_since IS NULL');
    });

    it('joins the FTS index and ranks by relevance for free text', () => {
        const { sql, params } = buildModelsQuery({ searchQuery: 'benchy hull' });
        expect(sql).toContain('models_fts MATCH ?');
        expect(sql).toContain('r.rank ASC');
        expect(params).toEqual(['"benchy" AND "hull"']);
    });

    it('uses LIKE for very short terms', () => {
        const { sql, params } = buildModelsQuery({ searchQuery: 'v2' });
        expect(sql).not.toContain('models_fts');
        expect(sql).toContain('m.filename LIKE ?');
        expect(params).toEqual(['%v2%', '%v2%', '%v2%']);
    });

    it('translates operators into SQL conditions', () => {
        const { sql, params } = buildModelsQuery({
            searchQuery: 'tag:printed type:stl tris:>100k size:<50 has:readme',
            collectionId: 7,
            tagIds: [1, 2],
            sortBy: 'triangles',
            sortOrder: 'asc',
        });
        expect(sql).toContain('collection_id = ?');
        expect(sql).toContain('m.file_type IN (?)');
        expect(sql).toContain('HAVING COUNT(DISTINCT tag_id) = ?');
        expect(sql).toContain('lower(t.name) = ?');
        expect(sql).toContain('m.triangle_count >= ?');
        expect(sql).toContain('max(m.bbox_x, m.bbox_y, m.bbox_z) <= ?');
        expect(sql).toContain('m.readme_text IS NOT NULL');
        expect(sql).toContain('m.triangle_count IS NULL, m.triangle_count ASC');
        expect(params).toEqual([7, 'stl', 1, 2, 2, 'printed', 100_000, 50]);
    });

    it('escapes LIKE wildcards in operator values', () => {
        const { params } = buildModelsQuery({ searchQuery: 'author:50%_off' });
        expect(params[0]).toBe('%50\\%\\_off%');
    });

    it('applies limit and offset when requested', () => {
        const { sql, params } = buildModelsQuery({ limit: 25 });
        expect(sql.endsWith('LIMIT ?')).toBe(true);
        expect(params).toEqual([25]);

        const paged = buildModelsQuery({ limit: 25, offset: 50 });
        expect(paged.sql.endsWith('LIMIT ? OFFSET ?')).toBe(true);
        expect(paged.params).toEqual([25, 50]);
    });

    it('builds a matching count query without limit or ordering', () => {
        const { countSql, countParams } = buildModelsQuery({ searchQuery: 'benchy tag:printed', limit: 25, offset: 50 });
        expect(countSql.startsWith('SELECT COUNT(*) AS total FROM models m JOIN')).toBe(true);
        expect(countSql).toContain('lower(t.name) = ?');
        expect(countSql).not.toContain('ORDER BY');
        expect(countSql).not.toContain('LIMIT');
        expect(countParams).toEqual(['"benchy"', 'printed']);
    });
});
