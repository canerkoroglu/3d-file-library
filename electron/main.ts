import { app, BrowserWindow, net, protocol } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { closeDatabase, getDatabase, initDatabase } from './database';
import { getDatabasePath, getThumbnailDir, isInsideDir, setUserDataDir } from './paths';
import { libraryEvents, notifyModelsUpdated } from './library';
import { setupIpcHandlers } from './ipcHandlers';
import { initializeWatchers, stopAllWatchers } from './fileWatcher';
import { enqueueAll, reportProgress, startIndexer, stopIndexer } from './indexer';
import { getThumbnailQueueSize, registerThumbnailIpc, requestThumbnailRender, setThumbnailQueueListener, setThumbnailWindow, stopThumbnailQueue } from './thumbnails';
import { initUpdater } from './updater';
import { getSetting, setSetting } from './settings';
import { getAiConfig } from './ai/provider';
import { enqueueEnrichment, startEnrichment } from './ai/enrichment';
import { rebuildSearchIndex } from './library';
import type { FileType, IndexProgress } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_UPDATED_DEBOUNCE_MS = 300;

process.on('uncaughtException', (error) => console.error('CRITICAL: Uncaught exception:', error));
process.on('unhandledRejection', (reason) => console.error('CRITICAL: Unhandled rejection:', reason));

let mainWindow: BrowserWindow | null = null;

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
        },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
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
        setThumbnailWindow(null);
    });

    setThumbnailWindow(mainWindow);
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

// Lets tests and secondary profiles run against a separate library (e.g. MODELIST_USER_DATA=/tmp/profile).
if (process.env.MODELIST_USER_DATA) {
    app.setPath('userData', path.resolve(process.env.MODELIST_USER_DATA));
}

protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } },
]);

/** MODELIST_WATCH_FOLDERS=<path>[:<path>...] registers watched folders at startup (scripted setups, end-to-end tests). */
function registerWatchFoldersFromEnv(): void {
    const raw = process.env.MODELIST_WATCH_FOLDERS;
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
    registerWatchFoldersFromEnv();
    registerMediaProtocol();
    registerThumbnailIpc();
    setupIpcHandlers();
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
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
    stopIndexer();
    stopThumbnailQueue();
    await stopAllWatchers();
    closeDatabase();
});
