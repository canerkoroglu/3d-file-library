import { useEffect, useState } from 'react';
import { OBJLoader, STLLoader, ThreeMFLoader } from 'three-stdlib';
import * as THREE from 'three';
import type { FileType } from '../types';

interface GenericModelProps {
    filepath: string;
    fileType: FileType;
    onError?: (message: string) => void;
}

const TARGET_SIZE = 5;
const MODEL_COLOR = '#3b82f6';

function disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((m) => m.dispose());
        }
    });
}

async function loadObject(buffer: ArrayBuffer, fileType: FileType): Promise<THREE.Object3D> {
    if (fileType === 'stl') {
        const geometry = new STLLoader().parse(buffer);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: MODEL_COLOR, roughness: 0.5, metalness: 0.05 }));
    }
    if (fileType === 'obj') {
        const object = new OBJLoader().parse(new TextDecoder().decode(buffer));
        object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material = new THREE.MeshStandardMaterial({ color: MODEL_COLOR, roughness: 0.5, metalness: 0.05 });
            }
        });
        return object;
    }
    const blob = new Blob([buffer], { type: 'model/3mf' });
    const url = URL.createObjectURL(blob);
    try {
        return await new ThreeMFLoader().loadAsync(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Wraps a loaded object so that the print bed's Z axis points up, the model sits on
 * the grid, and it is scaled to a consistent on-screen size.
 */
function prepare(object: THREE.Object3D): THREE.Group {
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
    return holder;
}

export default function GenericModel({ filepath, fileType, onError }: GenericModelProps) {
    const [object, setObject] = useState<THREE.Group | null>(null);

    useEffect(() => {
        let cancelled = false;
        let loaded: THREE.Group | null = null;

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
                setObject(loaded);
            } catch (error) {
                console.error('Failed to load model:', filepath, error);
                if (!cancelled) onError?.(error instanceof Error ? error.message : 'Failed to load model');
            }
        };
        void load();

        return () => {
            cancelled = true;
            if (loaded) disposeObject(loaded);
            setObject(null);
        };
    }, [filepath, fileType, onError]);

    if (!object) return null;
    return <primitive object={object} />;
}
