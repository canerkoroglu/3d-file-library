import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import fs from 'fs';

// Custom plugin to copy preload script
const copyPreload = () => ({
    name: 'copy-preload',
    buildStart() {
        if (!fs.existsSync('dist-electron')) {
            fs.mkdirSync('dist-electron');
        }
        fs.copyFileSync('electron/preload.js', 'dist-electron/preload.js');
        console.log('Copied electron/preload.js to dist-electron/preload.js');
    }
});

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
        copyPreload(),
        electron([
            {
                // Main process entry
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        rollupOptions: {
                            external: ['better-sqlite3', 'sharp']
                        }
                    }
                }
            }
        ]),
        renderer()
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    server: {
        port: 5173
    },
    build: {
        outDir: 'dist'
    }
})
