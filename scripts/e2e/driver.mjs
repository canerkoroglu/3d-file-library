// Launches the built app with remote debugging and drives its window over the
// Chrome DevTools Protocol. No extra dependencies: fetch and WebSocket are built into Node 22.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findPage(port, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
            const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
            if (page) return page;
        } catch {
            // not listening yet
        }
        await sleep(300);
    }
    throw new Error('The app window did not become reachable over the DevTools protocol');
}

/**
 * Starts the app and returns a session with `evaluate`, `waitFor` and `close`.
 * options: { profileDir, watchFolders: string[], port, appPath?, logFile? }
 */
export async function launchApp(options) {
    const port = options.port ?? 9333;
    const electronPath = options.appPath ?? require('electron');
    const args = options.appPath
        ? [`--remote-debugging-port=${port}`]
        : [path.join(PROJECT_ROOT, 'dist-electron', 'main.js'), `--remote-debugging-port=${port}`];

    const logFile = options.logFile ?? path.join(options.profileDir, 'app.log');
    const child = spawn(electronPath, args, {
        env: {
            ...process.env,
            MODELIST_USER_DATA: options.profileDir,
            MODELIST_WATCH_FOLDERS: (options.watchFolders ?? []).join(path.delimiter),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => fs.appendFileSync(logFile, chunk));
    child.stderr.on('data', (chunk) => fs.appendFileSync(logFile, chunk));

    const page = await findPage(port, 60_000);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('Could not open the DevTools websocket'));
    });

    let nextId = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
        }
    };

    const send = (method, params = {}) => {
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    };

    /** Evaluates an expression in the page; promises are awaited and the value returned by copy. */
    const evaluate = async (expression) => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) {
            const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
            throw new Error(`Page evaluation failed: ${description}`);
        }
        return result.result.value;
    };

    const waitFor = async (expression, { timeout = 30_000, label = expression } = {}) => {
        const started = Date.now();
        let last;
        while (Date.now() - started < timeout) {
            last = await evaluate(expression);
            if (last) return last;
            await sleep(250);
        }
        throw new Error(`Timed out after ${timeout}ms waiting for ${label}`);
    };

    await send('Runtime.enable');
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('#root')`, { label: 'the page to load' });

    return {
        evaluate,
        waitFor,
        logFile,
        async close() {
            try {
                ws.close();
            } catch {
                // already closed
            }
            child.kill();
            await sleep(300);
        },
    };
}
