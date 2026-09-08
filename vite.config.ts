import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

const NATIVE_MODULES = ['better-sqlite3', 'sharp'];

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
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
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
    },
    build: {
        outDir: 'dist',
    },
});
