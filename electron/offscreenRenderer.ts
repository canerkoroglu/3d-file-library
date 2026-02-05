import { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const THUMBNAIL_SIZE = 512;
let thumbnailWindow: BrowserWindow | null = null;

/**
 * Create a hidden offscreen window for rendering 3D thumbnails
 */
function createThumbnailWindow(): BrowserWindow {
    if (thumbnailWindow && !thumbnailWindow.isDestroyed()) {
        return thumbnailWindow;
    }

    thumbnailWindow = new BrowserWindow({
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        show: false,
        webPreferences: {
            offscreen: true,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Load a simple HTML page with Three.js
    const htmlPath = path.join(__dirname, 'thumbnail-renderer.html');
    thumbnailWindow.loadFile(htmlPath);

    return thumbnailWindow;
}

/**
 * Render a 3D model and capture as thumbnail
 */
export async function render3DThumbnail(
    filepath: string,
    fileType: string,
    outputPath: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        const window = createThumbnailWindow();

        // Set up paint listener to capture the frame
        const handlePaint = async (_event: any, _dirty: any, image: Electron.NativeImage) => {
            try {
                const buffer = image.toPNG();

                // Resize and save with sharp
                await sharp(buffer)
                    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
                        fit: 'contain',
                        background: { r: 35, g: 35, b: 35, alpha: 1 }
                    })
                    .png()
                    .toFile(outputPath);

                window.webContents.removeListener('paint', handlePaint);
                resolve();
            } catch (error) {
                window.webContents.removeListener('paint', handlePaint);
                reject(error);
            }
        };

        window.webContents.on('paint', handlePaint);

        // Send model data to renderer
        window.webContents.send('render-model', { filepath, fileType });

        // Timeout after 10 seconds
        setTimeout(() => {
            window.webContents.removeListener('paint', handlePaint);
            reject(new Error('Thumbnail rendering timeout'));
        }, 10000);
    });
}

/**
 * Clean up thumbnail window
 */
export function closeThumbnailWindow(): void {
    if (thumbnailWindow && !thumbnailWindow.isDestroyed()) {
        thumbnailWindow.close();
        thumbnailWindow = null;
    }
}
