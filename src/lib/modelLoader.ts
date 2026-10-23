/**
 * Shared loading and cleanup of 3D files for the viewer and the thumbnail renderer.
 */
import * as THREE from 'three';
import { GLTFLoader, OBJLoader, STLLoader, ThreeMFLoader } from 'three-stdlib';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import type { FileType } from '../types';
import { loadThreeMfObject } from './threeMf';

/**
 * Parses a file into a three.js object. STL and OBJ carry no usable materials, so their meshes
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
    const blob = new Blob([buffer], { type: 'model/3mf' });
    const url = URL.createObjectURL(blob);
    try {
        return await new ThreeMFLoader().loadAsync(url);
    } catch (error) {
        // Slicers (Bambu, Orca, Prusa) split geometry into external model parts via the
        // 3MF production extension, which the stock loader cannot resolve. Parse it ourselves.
        console.warn('ThreeMFLoader failed; using production-extension fallback:', error);
        return await loadThreeMfObject(buffer);
    } finally {
        URL.revokeObjectURL(url);
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
