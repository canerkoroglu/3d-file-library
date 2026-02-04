import fs from 'fs';
import crypto from 'crypto';
import { getDatabase } from './database';
import type { Model } from '../src/types';

interface DuplicateGroup {
    hash: string;
    models: Model[];
    totalSize: number;
}

/**
 * Calculate SHA-256 hash of a file
 */
function calculateFileHash(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filepath);

        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Find duplicate files in the library based on file hash
 */
export async function findDuplicates(): Promise<DuplicateGroup[]> {
    const db = getDatabase();

    // Get all models from database
    const models = db.prepare('SELECT * FROM models').all() as Model[];

    console.log(`Scanning ${models.length} files for duplicates...`);

    // Calculate hashes for all files
    const hashMap = new Map<string, Model[]>();

    for (const model of models) {
        // Skip if file doesn't exist
        if (!fs.existsSync(model.filepath)) {
            console.warn(`File not found: ${model.filepath}`);
            continue;
        }

        try {
            const hash = await calculateFileHash(model.filepath);

            if (!hashMap.has(hash)) {
                hashMap.set(hash, []);
            }

            hashMap.get(hash)!.push(model);
        } catch (error) {
            console.error(`Failed to hash ${model.filepath}:`, error);
        }
    }

    // Filter to only groups with duplicates (2+ files)
    const duplicateGroups: DuplicateGroup[] = [];

    for (const [hash, models] of hashMap.entries()) {
        if (models.length > 1) {
            const totalSize = models.reduce((sum, m) => sum + m.fileSize, 0);
            duplicateGroups.push({
                hash,
                models,
                totalSize
            });
        }
    }

    // Sort by total wasted space (descending)
    duplicateGroups.sort((a, b) => b.totalSize - a.totalSize);

    console.log(`Found ${duplicateGroups.length} duplicate groups`);

    return duplicateGroups;
}

/**
 * Delete a model file and its database entry
 */
export async function deleteModel(modelId: number): Promise<void> {
    const db = getDatabase();

    // Get model info
    const model = db.prepare('SELECT * FROM models WHERE id = ?').get(modelId) as Model | undefined;

    if (!model) {
        throw new Error(`Model ${modelId} not found`);
    }

    // Delete from database first
    db.prepare('DELETE FROM models WHERE id = ?').run(modelId);

    // Optionally delete the physical file
    // (commented out for safety - user might want to keep the file)
    // if (fs.existsSync(model.filepath)) {
    //   fs.unlinkSync(model.filepath);
    // }

    console.log(`Deleted model ${modelId}: ${model.filename}`);
}

/**
 * Get storage space that could be reclaimed
 */
export async function calculateWastedSpace(): Promise<{ totalWasted: number; groupCount: number }> {
    const duplicates = await findDuplicates();

    let totalWasted = 0;

    for (const group of duplicates) {
        // Wasted space = (n-1) * size, where n is number of duplicates
        // We keep one copy, so n-1 are "wasted"
        const wastedInGroup = (group.models.length - 1) * group.models[0].fileSize;
        totalWasted += wastedInGroup;
    }

    return {
        totalWasted,
        groupCount: duplicates.length
    };
}
