/**
 * A minimal better-sqlite3 look-alike on top of Node's built-in `node:sqlite`.
 *
 * better-sqlite3 is rebuilt for Electron's ABI on install, so the real module cannot be loaded by
 * the Node-based test runner. Tests that need a working database mock 'better-sqlite3' with this:
 *
 *     vi.mock('better-sqlite3', async () => ({ default: (await import('./helpers/sqliteShim')).default }));
 *
 * Only the parts of the API the app uses are implemented.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';

type Params = unknown[];

function normalizeRow<T>(row: T): T {
    if (!row || typeof row !== 'object') return row;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
        // better-sqlite3 returns BLOBs as Buffer; node:sqlite returns a plain Uint8Array.
        out[key] = value instanceof Uint8Array && !Buffer.isBuffer(value) ? Buffer.from(value) : value;
    }
    return out as T;
}

class Statement {
    constructor(private readonly statement: StatementSync) {}

    run(...params: Params): { changes: number; lastInsertRowid: number } {
        const result = this.statement.run(...(params as never[]));
        return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
    }

    get(...params: Params): unknown {
        return normalizeRow(this.statement.get(...(params as never[])));
    }

    all(...params: Params): unknown[] {
        return this.statement.all(...(params as never[])).map(normalizeRow);
    }
}

export default class Database {
    private readonly db: DatabaseSync;
    private depth = 0;
    private savepointCounter = 0;

    constructor(filename: string) {
        // Match SQLite's (and better-sqlite3's) default of foreign keys OFF; node:sqlite turns them on.
        this.db = new DatabaseSync(filename, { enableForeignKeyConstraints: false });
    }

    prepare(sql: string): Statement {
        return new Statement(this.db.prepare(sql));
    }

    exec(sql: string): this {
        this.db.exec(sql);
        return this;
    }

    pragma(source: string, options?: { simple?: boolean }): unknown {
        const rows = this.db.prepare(`PRAGMA ${source}`).all().map(normalizeRow) as Array<Record<string, unknown>>;
        if (options?.simple) return rows[0] ? Object.values(rows[0])[0] : undefined;
        return rows;
    }

    /** Like better-sqlite3: returns a function that runs `fn` in a transaction (a savepoint when nested). */
    transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
        return (...args: A): R => {
            const nested = this.depth > 0;
            const savepoint = `sp_${++this.savepointCounter}`;
            this.db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN');
            this.depth++;
            try {
                const result = fn(...args);
                this.depth--;
                this.db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
                return result;
            } catch (error) {
                this.depth--;
                this.db.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK');
                throw error;
            }
        };
    }

    close(): void {
        this.db.close();
    }
}
