/**
 * In-app updates through electron-updater and GitHub releases. Only active in packaged
 * builds; in development the status stays "unsupported" so the UI can explain why.
 */
import { app } from 'electron';
import electronUpdater from 'electron-updater';
import { getSetting, setSetting } from './settings';
import { version as packageVersion } from '../package.json';
import type { UpdateStatus } from '../src/types';

// electron-updater is CommonJS and exposes autoUpdater through a getter; destructure at runtime.
const { autoUpdater } = electronUpdater;

const SETTING_AUTO_CHECK = 'updates.autoCheck';
const STARTUP_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RELEASES_URL = 'https://github.com/canerkoroglu/3d-file-library/releases';

/** The app's own version; in development app.getVersion() would report Electron's. */
export const APP_VERSION = app.isPackaged ? app.getVersion() : packageVersion;

let status: UpdateStatus = {
    state: app.isPackaged ? 'idle' : 'unsupported',
    currentVersion: APP_VERSION,
    message: app.isPackaged ? undefined : 'Updates are only checked in installed builds.',
    releaseUrl: RELEASES_URL,
};
let listener: ((status: UpdateStatus) => void) | null = null;
let initialized = false;
let checkTimer: NodeJS.Timeout | null = null;

function setStatus(patch: Partial<UpdateStatus>): void {
    status = { ...status, ...patch };
    listener?.(status);
}

export function getUpdateStatus(): UpdateStatus {
    return status;
}

export function isAutoCheckEnabled(): boolean {
    return getSetting<boolean>(SETTING_AUTO_CHECK, true);
}

export function setAutoCheckEnabled(enabled: boolean): void {
    setSetting(SETTING_AUTO_CHECK, enabled);
    scheduleChecks();
}

function scheduleChecks(): void {
    if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
    }
    if (!app.isPackaged || !isAutoCheckEnabled()) return;
    checkTimer = setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
}

/** Release notes arrive as HTML/markdown text or as a list per version; reduce to plain text. */
function notesToText(notes: unknown): string | undefined {
    if (!notes) return undefined;
    const raw = typeof notes === 'string'
        ? notes
        : Array.isArray(notes)
            ? notes.map((n) => (typeof n === 'string' ? n : `${n.version}\n${n.note ?? ''}`)).join('\n\n')
            : String(notes);
    return raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|li|h\d)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim() || undefined;
}

/** Turns electron-updater's errors into something a person can act on. */
function describeError(error: unknown): { message: string; manualInstall?: boolean } {
    const text = error instanceof Error ? error.message : String(error);
    if (/app-update\.yml/i.test(text)) {
        return { message: 'This build was not configured for updates (no update manifest); download new versions from the releases page.', manualInstall: true };
    }
    if (/404|Cannot find latest release|Unable to find latest version|No published versions/i.test(text)) {
        return { message: 'No published release was found yet.' };
    }
    if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|net::ERR|getaddrinfo|network/i.test(text)) {
        return { message: 'Could not reach GitHub to check for updates.' };
    }
    if (/code signature|not signed|Could not get code signature/i.test(text)) {
        return { message: 'This copy is not code-signed, so it cannot update itself. Download the new version from the releases page.', manualInstall: true };
    }
    return { message: text.split('\n')[0].slice(0, 200) };
}

export function initUpdater(onStatus: (status: UpdateStatus) => void): void {
    listener = onStatus;
    if (initialized || !app.isPackaged) return;
    initialized = true;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = {
        info: (message: unknown) => console.log('[Updater]', message),
        warn: (message: unknown) => console.warn('[Updater]', message),
        error: (message: unknown) => console.error('[Updater]', message),
        debug: () => {},
    };

    autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking', message: undefined }));
    autoUpdater.on('update-available', (info) =>
        setStatus({
            state: 'available',
            version: info.version,
            releaseNotes: notesToText(info.releaseNotes),
            releaseDate: info.releaseDate,
            releaseUrl: `${RELEASES_URL}/tag/v${info.version}`,
            checkedAt: new Date().toISOString(),
            message: undefined,
            // Unsigned macOS builds cannot be swapped in place; point at the release instead.
            manualInstall: process.platform === 'darwin' && !getSetting<boolean>('updates.macSigned', false),
        }),
    );
    autoUpdater.on('update-not-available', (info) =>
        setStatus({ state: 'not-available', version: info.version, checkedAt: new Date().toISOString(), message: undefined }),
    );
    autoUpdater.on('download-progress', (progress) =>
        setStatus({
            state: 'downloading',
            progress: { percent: progress.percent, transferred: progress.transferred, total: progress.total, bytesPerSecond: progress.bytesPerSecond },
        }),
    );
    autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'downloaded', version: info.version, progress: undefined }));
    autoUpdater.on('error', (error) => setStatus({ state: 'error', progress: undefined, ...describeError(error) }));

    if (isAutoCheckEnabled()) {
        setTimeout(() => void checkForUpdates(), STARTUP_DELAY_MS);
    }
    scheduleChecks();
}

export async function checkForUpdates(): Promise<UpdateStatus> {
    if (!app.isPackaged) return status;
    if (status.state === 'checking' || status.state === 'downloading') return status;
    try {
        await autoUpdater.checkForUpdates();
    } catch (error) {
        setStatus({ state: 'error', ...describeError(error) });
    }
    return status;
}

export async function downloadUpdate(): Promise<void> {
    if (!app.isPackaged || status.state !== 'available') return;
    setStatus({ state: 'downloading', progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 } });
    try {
        await autoUpdater.downloadUpdate();
    } catch (error) {
        setStatus({ state: 'error', progress: undefined, ...describeError(error) });
    }
}

export function installUpdate(): void {
    if (status.state !== 'downloaded') return;
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
}
