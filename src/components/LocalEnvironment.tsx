import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Image-based lighting generated on the GPU from three.js' built-in studio room.
 * Replaces drei's environment presets, which download HDR files from a CDN at runtime
 * (failing offline and contacting a third-party server whenever a model is opened).
 */
export default function LocalEnvironment({ intensity = 1 }: { intensity?: number }) {
    const gl = useThree((state) => state.gl);
    const scene = useThree((state) => state.scene);

    useEffect(() => {
        const pmrem = new THREE.PMREMGenerator(gl);
        const room = new RoomEnvironment();
        const texture = pmrem.fromScene(room, 0.04).texture;
        const previous = scene.environment;
        const previousIntensity = scene.environmentIntensity;
        // The three.js scene is a mutable object by design; setting its environment here is intended.
        // eslint-disable-next-line react-hooks/immutability
        scene.environment = texture;
        scene.environmentIntensity = intensity;
        room.dispose();
        return () => {
            scene.environment = previous;
            scene.environmentIntensity = previousIntensity;
            texture.dispose();
            pmrem.dispose();
        };
    }, [gl, scene, intensity]);

    return null;
}
