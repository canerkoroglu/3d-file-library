/**
 * Persists main-process console output to <userData>/logs/main.log so problems in installed
 * builds (where there is no terminal) can be diagnosed. The file is rotated once it grows past
 * MAX_LOG_BYTES, keeping one previous file (main.old.log).
 */
import fs from 'fs';
import path from 'path';
import { format } from 'util';

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

let logFile: string | null = null;
let bytesWritten = 0;

export function getLogDir(userDataDir: string): string {
    return path.join(userDataDir, 'logs');
}

function rotateIfNeeded(): void {
    if (!logFile || bytesWritten < MAX_LOG_BYTES) return;
    try {
        fs.renameSync(logFile, logFile.replace(/\.log$/, '.old.log'));
    } catch {
        // Another process may hold the file; keep appending rather than lose output.
    }
    bytesWritten = 0;
}

function write(level: string, args: unknown[]): void {
    if (!logFile) return;
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${format(...args)}\n`;
    try {
        rotateIfNeeded();
        fs.appendFileSync(logFile, line);
        bytesWritten += Buffer.byteLength(line);
    } catch {
        // Logging must never take the app down.
    }
}

/** Mirrors console.* into the log file. Safe to call more than once. */
export function initFileLogging(userDataDir: string): string {
    const dir = getLogDir(userDataDir);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'main.log');
    if (logFile === file) return file;

    const alreadyPatched = logFile !== null;
    logFile = file;
    try {
        bytesWritten = fs.statSync(file).size;
    } catch {
        bytesWritten = 0;
    }
    if (alreadyPatched) return file;

    for (const level of LEVELS) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
            original(...args);
            write(level, args);
        };
    }
    write('info', ['---- session started ----']);
    return file;
}
