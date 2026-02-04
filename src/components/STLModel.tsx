import { useEffect, useRef, useState } from 'react';

import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';

interface STLModelProps {
    filepath: string;
}

export default function STLModel({ filepath }: STLModelProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

    useEffect(() => {
        const loader = new STLLoader();

        // Load the STL file
        loader.load(
            `file://${filepath}`,
            (loadedGeometry) => {
                // Center the geometry
                loadedGeometry.center();

                // Compute vertex normals for proper lighting
                loadedGeometry.computeVertexNormals();

                setGeometry(loadedGeometry);
            },
            undefined,
            (error) => {
                console.error('Error loading STL:', error);
            }
        );

        return () => {
            if (geometry) {
                geometry.dispose();
            }
        };
    }, [filepath]);

    useEffect(() => {
        if (meshRef.current && geometry) {
            // Calculate bounding box to auto-scale
            geometry.computeBoundingBox();
            const boundingBox = geometry.boundingBox;

            if (boundingBox) {
                const size = new THREE.Vector3();
                boundingBox.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);

                // Scale to fit in viewport (target size ~3 units)
                const scale = 3 / maxDim;
                meshRef.current.scale.set(scale, scale, scale);
            }
        }
    }, [geometry]);

    if (!geometry) {
        return null;
    }

    return (
        <mesh ref={meshRef} geometry={geometry}>
            <meshStandardMaterial
                color="#4a90e2"
                metalness={0.3}
                roughness={0.4}
                flatShading={false}
            />
        </mesh>
    );
}
