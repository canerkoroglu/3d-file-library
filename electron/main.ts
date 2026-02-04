import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupIpcHandlers } from './ipcHandlers';
import { initDatabase } from './database';
import { initializeWatchers, stopAllWatchers } from './fileWatcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration();

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

// App lifecycle
app.whenReady().then(async () => {
    // Initialize database
    await initDatabase();

    // Set up IPC handlers
    setupIpcHandlers(ipcMain);

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
