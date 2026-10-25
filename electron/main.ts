import { app, BrowserWindow, net, protocol } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { closeDatabase, getDatabase, initDatabase } from './database';
import { getDatabasePath, getThumbnailDir, isInsideDir, setUserDataDir } from './paths';
import { libraryEvents, notifyModelsUpdated } from './library';
import { setupIpcHandlers } from './ipcHandlers';
import { initializeWatchers, stopAllWatchers } from './fileWatcher';
import { enqueueAll, reportProgress, startIndexer, stopIndexer } from './indexer';
import { getThumbnailQueueSize, registerThumbnailIpc, requestThumbnailRender, setThumbnailQueueListener, setThumbnailWindowFactory, stopThumbnailQueue } from './thumbnails';
import { initUpdater } from './updater';
import { getSetting, setSetting } from './settings';
import { getAiConfig, loadStoredApiKey } from './ai/provider';
import { enqueueEnrichment, startEnrichment } from './ai/enrichment';
import { rebuildSearchIndex } from './library';
import { initFileLogging } from './logger';
import { MODEL_SCHEME_PRIVILEGES, registerModelProtocol } from './modelProtocol';
import { APP_SCHEME_PRIVILEGES, appPageUrl, hardenWebContents, registerAppProtocol } from './security';
import type { FileType, IndexProgress } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_UPDATED_DEBOUNCE_MS = 300;

let mainWindow: BrowserWindow | null = null;

// Unexpected errors are written to the log file and surfaced once, so they are not silently lost.
let reportedUnexpectedError = false;
function reportUnexpectedError(kind: string, error: unknown): void {
    console.error(`CRITICAL: ${kind}:`, error);
    if (reportedUnexpectedError) return;
    reportedUnexpectedError = true;
    sendToRenderer('app:notice', {
        kind: 'error',
        title: 'Something went wrong in the background',
        message: `${app.getName()} kept running, but if something looks off, restart it. Details are in the log (Settings → About → Open log folder).`,
    });
}
process.on('uncaughtException', (error) => reportUnexpectedError('Uncaught exception', error));
process.on('unhandledRejection', (reason) => reportUnexpectedError('Unhandled rejection', reason));

function sendToRenderer(channel: string, payload?: unknown): void {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

// Coalesce bursts of library changes (folder syncs, indexing) into one renderer refresh.
let modelsUpdatedTimer: NodeJS.Timeout | null = null;
libraryEvents.on('models-updated', () => {
    if (modelsUpdatedTimer) return;
    modelsUpdatedTimer = setTimeout(() => {
        modelsUpdatedTimer = null;
        sendToRenderer('models-updated');
    }, MODELS_UPDATED_DEBOUNCE_MS);
});
libraryEvents.on('collections-updated', () => sendToRenderer('collections-updated'));
libraryEvents.on('notice', (notice) => sendToRenderer('app:notice', notice));

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 768,
        minWidth: 1024,
        minHeight: 600,
        backgroundColor: '#1a1a1a',
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
        },
    });
    // New windows, navigation and <webview> are refused for every window (see hardenWebContents).

    if (process.env.VITE_DEV_SERVER_URL) {
        void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        void mainWindow.loadURL(appPageUrl());
    }

    mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
        console.error('Failed to load window:', code, description);
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        // Surface renderer errors in the terminal while developing.
        mainWindow.webContents.on('console-message', (event) => {
            if (event.level === 'error' || event.level === 'warning') {
                console.log(`[Renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
            }
        });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        // The hidden thumbnail window would otherwise keep the app alive on Windows and Linux.
        if (process.platform !== 'darwin') app.quit();
    });
}

/** Page fragment that tells the renderer bundle to run only the thumbnail renderer. */
const THUMBNAIL_PAGE_HASH = 'thumbnail-renderer';

/** The hidden window that renders 3D thumbnails, so batches of renders never stall the main window. */
function createThumbnailWindow(): BrowserWindow {
    const win = new BrowserWindow({
        show: false,
        width: 512,
        height: 512,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            // Keep timers and rendering running at full speed although the window is never shown.
            backgroundThrottling: false,
        },
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        void win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${THUMBNAIL_PAGE_HASH}`);
    } else {
        void win.loadURL(appPageUrl(THUMBNAIL_PAGE_HASH));
    }
    return win;
}

/** Serves thumbnails to the renderer. Only files inside the thumbnail directory are allowed. */
function registerMediaProtocol(): void {
    protocol.handle('media', (request) => {
        const url = new URL(request.url);
        let decoded = decodeURIComponent(url.pathname);
        // On Windows the pathname looks like "/C:/Users/..."; strip the leading slash.
        if (/^\/[a-zA-Z]:/.test(decoded)) decoded = decoded.slice(1);
        const filePath = path.normalize(decoded);

        if (!isInsideDir(getThumbnailDir(), filePath)) {
            return new Response('Forbidden', { status: 403 });
        }
        return net.fetch(pathToFileURL(filePath).toString());
    });
}

// Environment overrides accept the current MESHVAULT_* names and the MODELIST_* names used before the rename.
function envSetting(name: string): string | undefined {
    return process.env[`MESHVAULT_${name}`] || process.env[`MODELIST_${name}`] || undefined;
}

/**
 * Where the library lives. Before the rename to MeshVault, installed builds stored it under
 * "Modelist" and development runs under "stl-viewer"; an existing library there keeps being used
 * so nothing is lost. New installs use the new name.
 * MESHVAULT_USER_DATA=/tmp/profile points tests and secondary profiles at a separate library.
 */
const LEGACY_USER_DATA_DIRS = ['Modelist', 'stl-viewer'];
function resolveUserDataDir(): string {
    const override = envSetting('USER_DATA');
    if (override) return path.resolve(override);
    const current = app.getPath('userData');
    if (fs.existsSync(path.join(current, 'modelist.db'))) return current;
    for (const name of LEGACY_USER_DATA_DIRS) {
        const legacy = path.join(app.getPath('appData'), name);
        if (fs.existsSync(path.join(legacy, 'modelist.db'))) return legacy;
    }
    return current;
}
app.setPath('userData', resolveUserDataDir());

// MESHVAULT_SOFTWARE_GL=1 renders WebGL on the CPU (SwiftShader), for machines without a usable GPU such as CI runners.
if (envSetting('SOFTWARE_GL')) {
    app.commandLine.appendSwitch('use-angle', 'swiftshader');
    app.commandLine.appendSwitch('enable-unsafe-swiftshader');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
initFileLogging(app.getPath('userData'));

protocol.registerSchemesAsPrivileged([
    // Thumbnails; allowed by the page's Content-Security-Policy (img-src media:), so no CSP bypass.
    { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true } },
    MODEL_SCHEME_PRIVILEGES,
    APP_SCHEME_PRIVILEGES,
]);

/** MESHVAULT_WATCH_FOLDERS=<path>[:<path>...] registers watched folders at startup (scripted setups, end-to-end tests). */
function registerWatchFoldersFromEnv(): void {
    const raw = envSetting('WATCH_FOLDERS');
    if (!raw) return;
    const db = getDatabase();
    for (const folder of raw.split(path.delimiter).map((p) => p.trim()).filter(Boolean)) {
        const resolved = path.resolve(folder);
        const existing = db.prepare("SELECT id, is_active FROM collections WHERE type = 'watched' AND folder_path = ?").get(resolved) as
            | { id: number; is_active: number }
            | undefined;
        if (existing) {
            if (existing.is_active !== 1) db.prepare('UPDATE collections SET is_active = 1 WHERE id = ?').run(existing.id);
        } else {
            db.prepare("INSERT INTO collections (name, type, folder_path) VALUES (?, 'watched', ?)").run(path.basename(resolved), resolved);
        }
    }
}

app.whenReady().then(async () => {
    setUserDataDir(app.getPath('userData'));
    initDatabase(getDatabasePath());
    if (getSetting<boolean>('search.needsRebuild', false)) {
        console.log('[DB] Rebuilding the search index after a schema change');
        rebuildSearchIndex();
        setSetting('search.needsRebuild', null);
    }
    await loadStoredApiKey();
    registerWatchFoldersFromEnv();
    hardenWebContents();
    registerAppProtocol(path.join(__dirname, '../dist'));
    registerMediaProtocol();
    registerModelProtocol();
    registerThumbnailIpc();
    setupIpcHandlers();
    setThumbnailWindowFactory(createThumbnailWindow);
    createWindow();

    startIndexer({
        onProgress: (progress: IndexProgress) => sendToRenderer('index-progress', progress),
        onModelIndexed: (modelId, result) => {
            const row = getDatabase().prepare('SELECT filepath, file_type, ai_metadata FROM models WHERE id = ?').get(modelId) as
                | { filepath: string; file_type: FileType; ai_metadata: string | null }
                | undefined;
            if (row) requestThumbnailRender(modelId, row.filepath, row.file_type);
            // Newly analysed (not merely re-checked) models get described by the assistant when that is switched on.
            if (row && !result.unchanged && row.ai_metadata === null) {
                const ai = getAiConfig();
                if (ai.enabled && ai.autoEnrich) enqueueEnrichment({ ids: [modelId] });
            }
            notifyModelsUpdated();
        },
        getThumbnailQueueSize,
    });
    setThumbnailQueueListener(reportProgress);
    startEnrichment((progress) => sendToRenderer('ai:progress', progress));

    initUpdater((status) => sendToRenderer('updates:status', status));

    // Reconcile watched folders with disk, then make sure everything is analysed.
    await initializeWatchers();
    enqueueAll();

    app.on('activate', () => {
        // The hidden thumbnail window may still exist, so check for the main window itself.
        if (!mainWindow) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Electron does not wait for async 'before-quit' listeners, so hold the quit until the watchers
// have stopped and the database is closed cleanly (WAL checkpointed), then exit for real.
let shutdownState: 'running' | 'stopping' | 'done' = 'running';
app.on('before-quit', (event) => {
    if (shutdownState === 'done') return;
    event.preventDefault();
    if (shutdownState === 'stopping') return;
    shutdownState = 'stopping';

    const forceExit = setTimeout(() => {
        console.error('[App] Shutdown took too long; exiting anyway');
        shutdownState = 'done';
        app.exit(0);
    }, 5000);

    void (async () => {
        try {
            stopIndexer();
            stopThumbnailQueue();
            await stopAllWatchers();
        } catch (error) {
            console.error('[App] Error while stopping background work:', error);
        }
        try {
            closeDatabase();
        } catch (error) {
            console.error('[App] Error while closing the database:', error);
        }
        clearTimeout(forceExit);
        shutdownState = 'done';
        app.quit();
    })();
});
