import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { setupIpcHandlers } from './ipcHandlers';
import { initDatabase } from './database';
import { initializeWatchers, stopAllWatchers } from './fileWatcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Disable GPU acceleration removed to fix WebGL crashes
// app.disableHardwareAcceleration();

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('CRITICAL: Uncaught Exception:', error);
    // In a production app, you might want to show a dialog or write to a log file here
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 768,
        minWidth: 1024,
        minHeight: 600,
        backgroundColor: '#1a1a1a',
        resizable: true,
        movable: true,
        useContentSize: true, // Forces window to respect web content size if possible, but mainly ensures robust sizing
        webPreferences: {
            preload: (() => {
                const p = path.join(__dirname, 'preload.js');
                console.log('Loading preload script from:', p);
                return p;
            })(),
            contextIsolation: true,
            nodeIntegration: false,
        },
        titleBarStyle: 'hiddenInset',
        show: true, // Show immediately to debug sizing issues
    });

    // Explicitly set bounds to ensure it's not 0 height
    mainWindow.setBounds({ width: 1280, height: 768 });

    // Load the app
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        // Open DevTools in development
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('Failed to load window:', errorCode, errorDescription);
    });

    mainWindow.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
        console.log(`[Renderer]: ${message} (${sourceId}:${line})`);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

// Register privileges for custom protocol
protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } }
]);

// App lifecycle
app.whenReady().then(async () => {
    // Initialize database
    await initDatabase();

    // Register custom protocol for local files
    protocol.handle('media', (request) => {
        // Remove scheme and any number of slashes
        // Example: media:///C:/Users/... -> C:/Users/...
        let url = request.url;
        const queryIndex = url.indexOf('?');
        if (queryIndex !== -1) {
            url = url.slice(0, queryIndex);
        }
        let rawPath = url.replace(/^media:\/+/, '');

        // Decode URI component (handle spaces etc)
        let decodedPath = decodeURIComponent(rawPath);

        // Normalize slashes (Windows backslashes to forward slashes)
        let normalizedPath = decodedPath.replace(/\\/g, '/');

        // Fix missing drive letter colon? (e.g. c/Users -> c:/Users)
        if (/^[a-zA-Z]\//.test(normalizedPath)) {
            normalizedPath = normalizedPath.charAt(0) + ':' + normalizedPath.slice(1);
        }

        // Convert path to proper File URL (handles encoding of spaces etc)
        // pathToFileURL does NOT like forward slashes on Windows if it thinks it's a file path?
        // Actually pathToFileURL handles both usually, but let's be safe.
        // It produces "file:///C:/path%20with%20spaces"
        const fileUrl = pathToFileURL(normalizedPath).toString();

        console.log('--- MEDIA REQUEST ---');
        console.log('Original URL:', request.url);
        console.log('Decoded Path:', decodedPath);
        console.log('Normalized Path:', normalizedPath);
        console.log('Fetching (Encoded):', fileUrl);
        console.log('---------------------');

        return net.fetch(fileUrl).catch(e => {
            console.error('Failed to fetch local file:', fileUrl, e);
            throw e;
        });
    });

    // Set up IPC handlers
    setupIpcHandlers(ipcMain, mainWindow);

    // Create window
    createWindow();

    // Initialize file watchers after window is created
    setTimeout(() => {
        initializeWatchers(mainWindow);
    }, 1000); // Small delay to ensure everything is ready

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Graceful shutdown
app.on('before-quit', async () => {
    // Stop all file watchers
    await stopAllWatchers();
});

export { mainWindow };
