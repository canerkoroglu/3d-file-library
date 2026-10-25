import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

// Native modules and electron-updater (CommonJS with dynamic requires) are loaded from node_modules at runtime.
const NATIVE_MODULES = ['better-sqlite3', 'sharp', 'electron-updater'];

/**
 * Content-Security-Policy for the packaged renderer. Only added to production builds: the dev
 * server needs inline scripts and a websocket for hot reload. 'wasm-unsafe-eval' lets the STEP
 * (OpenCASCADE) engine compile; media: serves thumbnails; blob:/data: are used by the 3D loaders.
 */
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: media:",
    // model: streams library files to the viewer and the mesh worker.
    "connect-src 'self' data: blob: media: model:",
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
].join('; ');

const cspPlugin: Plugin = {
    name: 'meshvault-csp',
    apply: 'build',
    transformIndexHtml: () => [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
    ],
};

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
        cspPlugin,
        electron([
            {
                // Preload script: must be CommonJS so it runs inside the sandboxed preload context.
                entry: 'electron/preload.ts',
                onstart(args) {
                    args.reload();
                },
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        rollupOptions: {
                            // An array here makes Vite honour the format instead of the plugin's lib-mode default (ESM).
                            output: [{ format: 'cjs', entryFileNames: '[name].cjs' }],
                        },
                    },
                },
            },
            {
                // Indexer utility process. It is forked fresh for every job batch, so a rebuild needs no restart;
                // but the plugin only calls the onstart of whichever entry finishes building last, so this one
                // must still launch Electron on the very first build.
                entry: { 'indexer-worker': 'electron/indexer/worker.ts' },
                onstart(args) {
                    if (!(process as NodeJS.Process & { electronApp?: unknown }).electronApp) args.startup();
                },
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        rollupOptions: { external: NATIVE_MODULES },
                    },
                },
            },
            {
                // Main process. Its default onstart restarts Electron whenever it is rebuilt.
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        rollupOptions: { external: NATIVE_MODULES },
                    },
                },
            },
        ]),
        renderer(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, './src'),
        },
    },
    server: {
        port: 5173,
    },
    build: {
        outDir: 'dist',
    },
    // ES-module workers so the mesh worker can lazy-load the STEP engine.
    worker: {
        format: 'es',
    },
});
