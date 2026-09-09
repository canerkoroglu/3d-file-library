import { useEffect, useMemo, useState } from 'react';
import { GLTFLoader, OBJLoader, STLLoader, ThreeMFLoader } from 'three-stdlib';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import * as THREE from 'three';
import type { FileType } from '../types';
import { loadThreeMfObject } from '../lib/threeMf';

export interface ViewerDisplayOptions {
    wireframe: boolean;
    /** Use colours stored in the file (3MF) instead of the uniform colour. */
    fileColors: boolean;
    uniformColor: string;
    /** 0..1: fraction of the model height above which geometry is cut away; 1 shows everything. */
    clipHeight: number;
}

interface GenericModelProps {
    filepath: string;
    fileType: FileType;
    options: ViewerDisplayOptions;
    onError?: (message: string) => void;
}

const TARGET_SIZE = 5;

function disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((m) => m.dispose());
        }
    });
}

function makeMaterial(color: string): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide });
}

async function loadObject(buffer: ArrayBuffer, fileType: FileType): Promise<THREE.Object3D> {
    if (fileType === 'stl') {
        const geometry = new STLLoader().parse(buffer);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, makeMaterial('#3b82f6'));
    }
    if (fileType === 'obj') {
        const object = new OBJLoader().parse(new TextDecoder().decode(buffer));
        object.traverse((child) => {
            if (child instanceof THREE.Mesh) child.material = makeMaterial('#3b82f6');
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

interface Prepared {
    holder: THREE.Group;
    /** Height of the model in scene units after scaling (used for the section plane). */
    height: number;
    /** Materials as they came from the file, kept so "file colours" can be restored. */
    originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}

/**
 * Wraps a loaded object so that the print bed's Z axis points up, the model sits on
 * the grid, and it is scaled to a consistent on-screen size.
 */
function prepare(object: THREE.Object3D): Prepared {
    const oriented = new THREE.Group();
    oriented.rotation.x = -Math.PI / 2;
    oriented.add(object);

    const holder = new THREE.Group();
    holder.add(oriented);
    holder.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = TARGET_SIZE / maxDim;

    holder.scale.setScalar(scale);
    holder.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    holder.traverse((child) => {
        if (child instanceof THREE.Mesh) originalMaterials.set(child, child.material);
    });

    return { holder, height: size.y * scale, originalMaterials };
}

export default function GenericModel({ filepath, fileType, options, onError }: GenericModelProps) {
    const [prepared, setPrepared] = useState<Prepared | null>(null);
    const uniformMaterial = useMemo(() => makeMaterial(options.uniformColor), [options.uniformColor]);
    const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);

    useEffect(() => {
        let cancelled = false;
        let loaded: Prepared | null = null;

        const load = async () => {
            try {
                const buffer = await window.electronAPI.readFileAsBuffer(filepath);
                if (cancelled) return;
                const raw = await loadObject(buffer, fileType);
                if (cancelled) {
                    disposeObject(raw);
                    return;
                }
                loaded = prepare(raw);
                setPrepared(loaded);
            } catch (error) {
                console.error('Failed to load model:', filepath, error);
                if (!cancelled) onError?.(error instanceof Error ? error.message : 'Failed to load model');
            }
        };
        void load();

        return () => {
            cancelled = true;
            if (loaded) disposeObject(loaded.holder);
            setPrepared(null);
        };
    }, [filepath, fileType, onError]);

    // Apply display options to every mesh whenever they change.
    useEffect(() => {
        if (!prepared) return;
        const clipping = options.clipHeight < 1;
        clipPlane.constant = prepared.height * Math.max(0, options.clipHeight);

        for (const [mesh, original] of prepared.originalMaterials) {
            // glTF/USDZ carry their own materials and textures — always show them; 3MF is toggleable.
            const useFile = fileType === '3mf' ? options.fileColors : fileType === 'glb' || fileType === 'usdz';
            mesh.material = useFile ? original : uniformMaterial;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) {
                (material as THREE.Material & { wireframe?: boolean }).wireframe = options.wireframe;
                material.clippingPlanes = clipping ? [clipPlane] : null;
                material.side = THREE.DoubleSide;
                material.needsUpdate = true;
            }
        }
    }, [prepared, options, uniformMaterial, clipPlane, fileType]);

    useEffect(() => () => uniformMaterial.dispose(), [uniformMaterial]);

    if (!prepared) return null;
    return <primitive object={prepared.holder} />;
}
