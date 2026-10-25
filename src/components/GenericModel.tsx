import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { FileType } from '../types';
import { disposeMaterials, disposeObject, loadModel } from '../lib/modelLoader';

export interface ViewerDisplayOptions {
    wireframe: boolean;
    /** Use colours stored in the file (3MF) instead of the uniform colour. */
    fileColors: boolean;
    uniformColor: string;
    /** 0..1: fraction of the model height above which geometry is cut away; 1 shows everything. */
    clipHeight: number;
}

interface GenericModelProps {
    modelId: number;
    /** Lets very large files take the background parser straight away. */
    fileSize?: number;
    fileType: FileType;
    options: ViewerDisplayOptions;
    onError?: (message: string) => void;
    /** Called once the model has been parsed and is on screen. */
    onLoaded?: () => void;
}

const TARGET_SIZE = 5;

function makeMaterial(color: string): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide });
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

/**
 * Frees a loaded model. Meshes may currently show the shared uniform material, so dispose the
 * geometry plus the materials that came with the file instead of whatever is assigned right now.
 */
function releasePrepared(prepared: Prepared): void {
    const fileMaterials = new Set<THREE.Material>();
    for (const original of prepared.originalMaterials.values()) {
        for (const m of Array.isArray(original) ? original : [original]) fileMaterials.add(m);
    }
    const inUse = new Set<THREE.Material>();
    prepared.holder.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
                if (!fileMaterials.has(m)) inUse.add(m);
            }
        }
    });
    // Geometry and any file materials still assigned are freed here; the uniform material is kept.
    disposeObject(prepared.holder, inUse);
    for (const original of prepared.originalMaterials.values()) disposeMaterials(original);
}

export default function GenericModel({ modelId, fileSize, fileType, options, onError, onLoaded }: GenericModelProps) {
    const [prepared, setPrepared] = useState<Prepared | null>(null);
    const uniformMaterial = useMemo(() => makeMaterial(options.uniformColor), [options.uniformColor]);
    const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);

    useEffect(() => {
        let cancelled = false;
        let loaded: Prepared | null = null;

        const load = async () => {
            try {
                const raw = await loadModel(modelId, fileType, () => makeMaterial('#3b82f6'), fileSize);
                if (cancelled) {
                    disposeObject(raw);
                    return;
                }
                loaded = prepare(raw);
                setPrepared(loaded);
                onLoaded?.();
            } catch (error) {
                console.error('Failed to load model:', modelId, error);
                if (!cancelled) onError?.(error instanceof Error ? error.message : 'Failed to load model');
            }
        };
        void load();

        return () => {
            cancelled = true;
            if (loaded) releasePrepared(loaded);
            setPrepared(null);
        };
    }, [modelId, fileSize, fileType, onError, onLoaded]);

    // Apply display options to every mesh whenever they change. three.js objects are a mutable scene
    // graph by design, so updating them in place here is intended (hence the immutability exemptions).
    useEffect(() => {
        if (!prepared) return;
        const clipping = options.clipHeight < 1;
        // eslint-disable-next-line react-hooks/immutability -- three.js plane, mutated in place
        clipPlane.constant = prepared.height * Math.max(0, options.clipHeight);

        for (const [mesh, original] of prepared.originalMaterials) {
            // glTF/USDZ carry their own materials and textures — always show them; 3MF is toggleable.
            const useFile = fileType === '3mf' ? options.fileColors : fileType === 'glb' || fileType === 'usdz' || fileType === 'step';
            // eslint-disable-next-line react-hooks/immutability -- three.js mesh, mutated in place
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
