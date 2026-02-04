import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';


const THUMBNAIL_SIZE = 512;
const THUMBNAIL_DIR = path.join(app.getPath('userData'), 'thumbnails');

// Ensure thumbnail directory exists
if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

/**
 * Generate a thumbnail for a 3D model file
 */
export async function generateThumbnail(
    filepath: string,
    modelId: number
): Promise<string> {
    const ext = path.extname(filepath).toLowerCase();

    // For 3MF files, try to extract embedded thumbnail first
    if (ext === '.3mf') {
        const embeddedThumbnail = await extractEmbeddedThumbnail(filepath, modelId);
        if (embeddedThumbnail) {
            return embeddedThumbnail;
        }
    }

    // For now, create a simple placeholder thumbnail
    // TODO: Implement full 3D rendering when electron-gl or similar is set up
    return await createPlaceholderThumbnail(modelId, ext);
}

/**
 * Extract embedded thumbnail from 3MF file
 */
async function extractEmbeddedThumbnail(
    filepath: string,
    modelId: number
): Promise<string | null> {
    try {
        const JSZip = (await import('jszip')).default;
        const zipData = fs.readFileSync(filepath);
        const zip = await JSZip.loadAsync(zipData);

        // 3MF files can have thumbnails in /Metadata/thumbnail.png or /Thumbnails/thumbnail.png
        let thumbnailFile = zip.file(/Metadata\/thumbnail\.(png|jpg|jpeg)/i)[0];
        if (!thumbnailFile) {
            thumbnailFile = zip.file(/Thumbnails\/thumbnail\.(png|jpg|jpeg)/i)[0];
        }

        if (thumbnailFile) {
            const imageBuffer = await thumbnailFile.async('nodebuffer');
            const thumbnailPath = path.join(THUMBNAIL_DIR, `${modelId}.png`);

            // Resize and save
            await sharp(imageBuffer)
                .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
                    fit: 'contain',
                    background: { r: 35, g: 35, b: 35, alpha: 1 }
                })
                .png()
                .toFile(thumbnailPath);

            return thumbnailPath;
        }
    } catch (error) {
        console.error('Failed to extract embedded thumbnail:', error);
    }

    return null;
}

/**
 * Create a simple placeholder thumbnail
 * In the future, this can be replaced with actual 3D rendering
 */
async function createPlaceholderThumbnail(
    modelId: number,
    ext: string
): Promise<string> {
    const thumbnailPath = path.join(THUMBNAIL_DIR, `${modelId}.png`);

    // Create a simple gradient placeholder with file type
    const svg = `
    <svg width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#2563eb;stop-opacity:0.5" />
        </linearGradient>
      </defs>
      <rect width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" fill="#232323"/>
      <rect width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" fill="url(#grad)"/>
      <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="48" font-weight="bold" 
            fill="#ffffff" text-anchor="middle" dominant-baseline="middle" opacity="0.8">
        ${ext.replace('.', '').toUpperCase()}
      </text>
      <text x="50%" y="60%" font-family="Arial, sans-serif" font-size="16" 
            fill="#cccccc" text-anchor="middle" dominant-baseline="middle" opacity="0.6">
        3D Model
      </text>
    </svg>
  `;

    await sharp(Buffer.from(svg))
        .png()
        .toFile(thumbnailPath);

    return thumbnailPath;
}

/**
 * Get thumbnail path for a model
 */
export function getThumbnailPath(modelId: number): string | null {
    const thumbnailPath = path.join(THUMBNAIL_DIR, `${modelId}.png`);
    return fs.existsSync(thumbnailPath) ? thumbnailPath : null;
}

/**
 * Delete thumbnail for a model
 */
export function deleteThumbnail(modelId: number): void {
    const thumbnailPath = path.join(THUMBNAIL_DIR, `${modelId}.png`);
    if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
    }
}

/**
 * Get thumbnail directory path
 */
export function getThumbnailDirectory(): string {
    return THUMBNAIL_DIR;
}
