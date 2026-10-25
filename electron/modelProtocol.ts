/**
 * model://library/<id> streams a library file to the renderer (viewer, thumbnail window and the
 * mesh worker) straight from disk. Unlike the old read-file IPC call, the file is never copied
 * whole into the main process or across IPC, and only files that belong to the library are served.
 */
import { net, protocol } from 'electron';
import { pathToFileURL } from 'url';
import { getDatabase } from './database';

export const MODEL_SCHEME = 'model';

/** Must run before the app is ready. */
export const MODEL_SCHEME_PRIVILEGES: Electron.CustomScheme = {
    scheme: MODEL_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
};

/** Parses model://library/<id>; returns null for anything else. */
export function parseModelUrl(raw: string): number | null {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== `${MODEL_SCHEME}:` || url.hostname !== 'library') return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 1 || !/^\d+$/.test(segments[0])) return null;
    const id = Number(segments[0]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const HEADERS = {
    'Content-Type': 'application/octet-stream',
    // The renderer runs on file:// (origin "null") and the worker fetches cross-scheme.
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
};

export function registerModelProtocol(): void {
    protocol.handle(MODEL_SCHEME, async (request) => {
        const id = parseModelUrl(request.url);
        if (id === null) return new Response('Bad request', { status: 400, headers: HEADERS });

        const row = getDatabase().prepare('SELECT filepath FROM models WHERE id = ?').get(id) as { filepath: string } | undefined;
        if (!row) return new Response('Not found', { status: 404, headers: HEADERS });

        try {
            const file = await net.fetch(pathToFileURL(row.filepath).toString());
            if (!file.ok) return new Response('Not found', { status: 404, headers: HEADERS });
            const headers: Record<string, string> = { ...HEADERS };
            const length = file.headers.get('content-length');
            if (length) headers['Content-Length'] = length;
            return new Response(file.body, { status: 200, headers });
        } catch (error) {
            console.warn(`[model://] Could not read ${row.filepath}:`, error);
            return new Response('Not found', { status: 404, headers: HEADERS });
        }
    });
}
