import React, { useRef, useEffect, useState } from 'react';
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
    const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
    const [object, setObject] = useState<THREE.Object3D | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Load file via IPC and parse manually
    useEffect(() => {
        let cancelled = false;

        const loadFile = async () => {
            try {
                console.log('Loading file via IPC:', filepath);

                // Check if electronAPI is available
                if (!window.electronAPI || !window.electronAPI.readFileAsBuffer) {
                    console.error('electronAPI.readFileAsBuffer not available');
                    setError('File loading API not available');
                    return;
                }

                const arrayBuffer = await window.electronAPI.readFileAsBuffer(filepath);

                if (cancelled) return;

                // Parse the file data based on type
                if (fileType === 'stl') {
                    const loader = new STLLoader();
                    const geom = loader.parse(arrayBuffer);
                    if (!cancelled) {
                        setGeometry(geom);
                        setObject(null);
                    }
                } else if (fileType === '3mf') {
                    const loader = new ThreeMFLoader();
                    // ThreeMFLoader expects a string path, not ArrayBuffer
                    // We need to create a blob URL for this
                    const blob = new Blob([arrayBuffer], { type: 'model/3mf' });
                    const blobUrl = URL.createObjectURL(blob);
                    const obj = await loader.loadAsync(blobUrl);
                    URL.revokeObjectURL(blobUrl);
                    if (!cancelled) {
                        setObject(obj);
                        setGeometry(null);
                    }
                } else if (fileType === 'obj') {
                    const loader = new OBJLoader();
                    const text = new TextDecoder().decode(arrayBuffer);
                    const obj = loader.parse(text);
                    if (!cancelled) {
                        setObject(obj);
                        setGeometry(null);
                    }
                }

                console.log('Successfully loaded model:', filepath);
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to load file:', filepath, error);
                    setError('Failed to load model');
                }
            }
        };

        loadFile();

        return () => {
            cancelled = true;
        };
    }, [filepath, fileType]);

    // Center and scale logic
    useEffect(() => {
        if (!meshRef.current) return;

        if (geometry) {
            geometry.computeBoundingBox();
            geometry.center();
            geometry.computeBoundingBox(); // Recompute after centering

            // Move to floor (y=0)
            if (geometry.boundingBox) {
                geometry.translate(0, -geometry.boundingBox.min.y, 0);
            }

            // Auto-scale
            if (geometry.boundingBox) {
                const size = new THREE.Vector3();
                geometry.boundingBox.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);

                if (maxDim > 20 || maxDim < 0.1) {
                    const scale = 5 / maxDim;
                    meshRef.current.scale.set(scale, scale, scale);
                }
            }
        } else if (object) {
            const box = new THREE.Box3().setFromObject(object);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            // Center X and Z, but align bottom to Y=0
            object.position.x += (object.position.x - center.x);
            object.position.y += (object.position.y - box.min.y);
            object.position.z += (object.position.z - center.z);

            // Auto-scale
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 20 || maxDim < 0.1) {
                const scale = 5 / maxDim;
                object.scale.set(scale, scale, scale);
            }
        }
    }, [geometry, object]);

    // Clean up resources on unmount
    useEffect(() => {
        return () => {
            if (geometry) {
                geometry.dispose();
            }
            if (object) {
                object.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.geometry.dispose();
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            }
        };
    }, [geometry, object]);

    if (error) {
        return null;
    }

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
