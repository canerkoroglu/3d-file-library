/**
 * Shared loading and cleanup of 3D files for the viewer and the thumbnail renderer.
 *
 * Files are read through the model:// protocol, which the main process streams from disk (no
 * whole-file copies over IPC). STL, OBJ, STEP and multi-part 3MF are parsed in a Web Worker so
 * large files do not freeze the interface; if the worker cannot run, parsing falls back to the page.
 */
import * as THREE from 'three';
import { GLTFLoader, OBJLoader, STLLoader, ThreeMFLoader } from 'three-stdlib';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import type { FileType } from '../types';
import { loadThreeMfObject } from './threeMf';
import { deserializeObject } from './meshTransfer';
import { MeshWorkerUnavailable, parseInWorker } from './meshWorkerClient';
import type { WorkerFormat } from './meshWorkerProtocol';

/** 3MF files above this size skip the DOM-based stock loader (which blocks the page) and use the worker parser. */
const LARGE_3MF_BYTES = 40 * 1024 * 1024;

/** URL from which the main process streams a library file (see electron/modelProtocol.ts). */
export function modelFileUrl(modelId: number): string {
    return `model://library/${modelId}`;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(response.status === 404 ? 'The file is no longer in the library.' : `Could not read the file (${response.status}).`);
    return response.arrayBuffer();
}

/** Parses in the worker; resolves to null when no worker can run here, so the caller falls back to the page. */
async function tryWorker(url: string, format: WorkerFormat, makeMaterial: () => THREE.Material): Promise<THREE.Object3D | null> {
    try {
        return deserializeObject(await parseInWorker(url, format), makeMaterial);
    } catch (error) {
        if (error instanceof MeshWorkerUnavailable) return null;
        throw error;
    }
}

/**
 * Loads a library model by id. `fileSize` (when known) lets very large 3MF files go straight to
 * the worker parser.
 */
export async function loadModel(modelId: number, fileType: FileType, makeMaterial: () => THREE.Material, fileSize?: number): Promise<THREE.Object3D> {
    const url = modelFileUrl(modelId);

    if (fileType === 'stl' || fileType === 'obj' || fileType === 'step') {
        const parsed = await tryWorker(url, fileType, makeMaterial);
        if (parsed) return parsed;
        return loadModelObject(await fetchBytes(url), fileType, makeMaterial);
    }

    if (fileType === '3mf') {
        if (fileSize !== undefined && fileSize > LARGE_3MF_BYTES) {
            const parsed = await tryWorker(url, '3mf-parts', makeMaterial);
            if (parsed) return parsed;
        }
        const buffer = await fetchBytes(url);
        try {
            return await loadThreeMfStock(buffer);
        } catch (error) {
            // Slicers (Bambu, Orca, Prusa) split geometry into external model parts via the
            // 3MF production extension, which the stock loader cannot resolve. Parse it ourselves.
            console.warn('ThreeMFLoader failed; using production-extension fallback:', error);
            const parsed = await tryWorker(url, '3mf-parts', makeMaterial);
            return parsed ?? loadThreeMfObject(buffer);
        }
    }

    return loadModelObject(await fetchBytes(url), fileType, makeMaterial);
}

async function loadThreeMfStock(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    const url = URL.createObjectURL(new Blob([buffer], { type: 'model/3mf' }));
    try {
        return await new ThreeMFLoader().loadAsync(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Parses file bytes into a three.js object on the page (the fallback path, and glTF/USDZ). STL and OBJ carry no usable materials, so their meshes
 * get one from `makeMaterial`; the other formats keep the materials stored in the file.
 */
export async function loadModelObject(buffer: ArrayBuffer, fileType: FileType, makeMaterial: () => THREE.Material): Promise<THREE.Object3D> {
    if (fileType === 'stl') {
        const geometry = new STLLoader().parse(buffer);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, makeMaterial());
    }
    if (fileType === 'obj') {
        const object = new OBJLoader().parse(new TextDecoder().decode(buffer));
        object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                disposeMaterials(child.material);
                child.material = makeMaterial();
            }
        });
        return object;
    }
    if (fileType === 'glb') {
        const gltf = await new GLTFLoader().parseAsync(buffer, '');
        return gltf.scene;
    }
    if (fileType === 'usdz') {
        return new USDZLoader().parse(new Uint8Array(buffer));
    }
    if (fileType === 'step') {
        // The CAD kernel is large; only load it when a STEP file is actually opened.
        const { loadStepObject } = await import('./step');
        return await loadStepObject(buffer);
    }
    try {
        return await loadThreeMfStock(buffer);
    } catch (error) {
        console.warn('ThreeMFLoader failed; using production-extension fallback:', error);
        return await loadThreeMfObject(buffer);
    }
}

/** Disposes materials together with any textures they reference (glTF/USDZ/3MF can embed several). */
export function disposeMaterials(material: THREE.Material | THREE.Material[] | null | undefined, keep?: ReadonlySet<THREE.Material>): void {
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
        if (keep?.has(m)) continue;
        for (const value of Object.values(m)) {
            if (value instanceof THREE.Texture) value.dispose();
        }
        m.dispose();
    }
}

/**
 * Frees the GPU resources of everything under `object`: geometries, materials and textures.
 * Materials in `keep` (e.g. a shared uniform material still in use elsewhere) are left alone.
 */
export function disposeObject(object: THREE.Object3D, keep?: ReadonlySet<THREE.Material>): void {
    object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
            child.geometry.dispose();
            disposeMaterials(child.material, keep);
        }
    });
}
