/**
 * Security plumbing for the main process (see docs/security.md):
 *  - app://bundle serves the renderer from the build folder, so pages never run on file://
 *  - every window: no webviews, no new windows, no navigation away from the app, no permissions
 *  - "granted paths": file-system paths the renderer may hand back to the main process only
 *    after the user chose them in a dialog or dropped them on the window
 */
import { app, net, protocol, session, shell, type WebContents } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import { isInsideDir } from './paths';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://bundle`;

/** Must be registered before the app is ready. */
export const APP_SCHEME_PRIVILEGES: Electron.CustomScheme = {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
};

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
};

/** Serves files from `distDir` under app://bundle/…; anything outside it is refused. */
export function registerAppProtocol(distDir: string): void {
    protocol.handle(APP_SCHEME, async (request) => {
        const url = new URL(request.url);
        if (url.hostname !== 'bundle') return new Response('Not found', { status: 404 });
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
        const filePath = path.resolve(distDir, relative);
        if (!isInsideDir(distDir, filePath)) return new Response('Forbidden', { status: 403 });

        const file = await net.fetch(pathToFileURL(filePath).toString()).catch(() => null);
        if (!file || !file.ok) return new Response('Not found', { status: 404 });
        const type = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        return new Response(file.body, { status: 200, headers: { 'Content-Type': type } });
    });
}

/** URL of the renderer page in production, optionally with a fragment (e.g. the thumbnail renderer). */
export function appPageUrl(hash?: string): string {
    return `${APP_ORIGIN}/index.html${hash ? `#${hash}` : ''}`;
}

function isAppUrl(url: string): boolean {
    if (url.startsWith(`${APP_ORIGIN}/`)) return true;
    const dev = process.env.VITE_DEV_SERVER_URL;
    return Boolean(dev && url.startsWith(dev));
}

/**
 * Applies the same rules to every web contents the app creates: links to https sites open in the
 * system browser, nothing else opens, nothing navigates away from the app, no <webview>.
 * Also denies every permission request (camera, microphone, notifications, geolocation…).
 */
export function hardenWebContents(): void {
    app.on('web-contents-created', (_event, contents: WebContents) => {
        contents.on('will-attach-webview', (event) => event.preventDefault());
        contents.setWindowOpenHandler(({ url }) => {
            if (/^https:\/\//i.test(url)) void shell.openExternal(url);
            return { action: 'deny' };
        });
        contents.on('will-navigate', (event, url) => {
            if (!isAppUrl(url)) event.preventDefault();
        });
        contents.on('will-redirect', (event, url) => {
            if (!isAppUrl(url)) event.preventDefault();
        });
    });

    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
}

// ============ Granted paths ============

const granted = new Set<string>();

function key(p: string): string {
    const resolved = path.resolve(p);
    // Windows and (by default) macOS file systems are case-insensitive.
    return process.platform === 'linux' ? resolved : resolved.toLowerCase();
}

/** Records paths the user chose (dialog or drag-and-drop) so later IPC calls may use them. */
export function grantPaths(paths: string[]): void {
    for (const p of paths) if (typeof p === 'string' && p) granted.add(key(p));
}

/** True when the user chose this path during this session. */
export function isGranted(p: string): boolean {
    return typeof p === 'string' && p.length > 0 && granted.has(key(p));
}
