import { useRef, useEffect, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import { ThreeMFLoader } from 'three-stdlib';
import { OBJLoader } from 'three-stdlib';
import * as THREE from 'three';

interface GenericModelProps {
    filepath: string;
    fileType: string;
}

export default function GenericModel({ filepath, fileType }: GenericModelProps) {
    const meshRef = useRef<THREE.Group>(null);
    const [url, setUrl] = useState<string | null>(null);

    // Create a local URL for the file to handle Electron file protocol
    useEffect(() => {
        // In Electron, we can use the file:// protocol directly, 
        // but depending on security settings/context we might need to handle it.
        // For now, assuming the filepath is absolute and accessible.
        // If needed, we could read the file in main process and pass a blob URL.
        const fileUrl = `file://${filepath}`;
        setUrl(fileUrl);

        return () => {
            // Cleanup if we used createObjectURL
        };
    }, [filepath]);

    if (!url) return null;

    return (
        <group dispose={null}>
            <ModelLoader url={url} fileType={fileType} meshRef={meshRef} />
        </group>
    );
}

function ModelLoader({ url, fileType, meshRef }: { url: string, fileType: string, meshRef: React.RefObject<THREE.Group | null> }) {

    // Select loader based on file type
    let geometry: THREE.BufferGeometry | undefined;
    let object: THREE.Object3D | undefined;

    try {
        if (fileType === 'stl') {
            geometry = useLoader(STLLoader, url);
        } else if (fileType === '3mf') {
            object = useLoader(ThreeMFLoader, url);
        } else if (fileType === 'obj') {
            object = useLoader(OBJLoader, url);
        }
    } catch (error) {
        console.error(`Failed to load model: ${url}`, error);
        return null;
    }

    // Center and scale logic
    useEffect(() => {
        const target = object || (meshRef.current?.children[0] as THREE.Mesh);

        if (target) {
            // If it's a geometry (STL)
            if (geometry) {
                geometry.computeBoundingBox();
                geometry.center();

                // Auto-scale
                if (geometry.boundingBox) {
                    const size = new THREE.Vector3();
                    geometry.boundingBox.getSize(size);
                    const maxDim = Math.max(size.x, size.y, size.z);

                    if (maxDim > 20 || maxDim < 0.1) {
                        const scale = 5 / maxDim;
                        if (meshRef.current) {
                            meshRef.current.scale.set(scale, scale, scale);
                        }
                    }
                }
            }
            // If it's an object (3MF/OBJ)
            else if (object) {
                const box = new THREE.Box3().setFromObject(object);
                const size = new THREE.Vector3();
                box.getSize(size);
                const center = new THREE.Vector3();
                box.getCenter(center);

                // Center the object
                object.position.x += (object.position.x - center.x);
                object.position.y += (object.position.y - center.y);
                object.position.z += (object.position.z - center.z);

                // Auto-scale
                const maxDim = Math.max(size.x, size.y, size.z);
                if (maxDim > 20 || maxDim < 0.1) {
                    const scale = 5 / maxDim;
                    object.scale.set(scale, scale, scale);
                }
            }
        }
    }, [geometry, object]);

    if (fileType === 'stl' && geometry) {
        return (
            <mesh ref={meshRef as unknown as React.RefObject<THREE.Mesh>} geometry={geometry}>
                <meshStandardMaterial color="#3b82f6" />
            </mesh>
        );
    }

    if (object) {
        return <primitive object={object} ref={meshRef} />;
    }

    return null;
}
