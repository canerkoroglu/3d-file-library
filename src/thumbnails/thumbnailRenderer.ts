/**
 * Renders 3D thumbnails on behalf of the main process. The main process queues one
 * job at a time; this module loads the file, renders it into an off-screen canvas
 * and sends the PNG back.
 */
import * as THREE from 'three';
import type { FileType, ThumbnailRenderRequest } from '../types';
import { disposeObject, loadModel } from '../lib/modelLoader';

const SIZE = 512;
const BACKGROUND = 0x232323;
const MODEL_COLOR = 0x3b82f6;

let renderer: THREE.WebGLRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;

function getRenderer(): THREE.WebGLRenderer {
    if (renderer) return renderer;
    canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    return renderer;
}

/** Print files are Z-up; three.js is Y-up. Wrap the object so Z points up on screen. */
function orient(object: THREE.Object3D): THREE.Group {
    const group = new THREE.Group();
    group.rotation.x = -Math.PI / 2;
    group.add(object);
    return group;
}

export async function renderThumbnail(modelId: number, fileType: FileType): Promise<string> {
    const object = await loadModel(modelId, fileType, () => new THREE.MeshStandardMaterial({ color: MODEL_COLOR, roughness: 0.55, metalness: 0.05 }));
    const gl = getRenderer();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const oriented = orient(object);
    const box = new THREE.Box3().setFromObject(oriented);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    const holder = new THREE.Group();
    holder.add(oriented);
    oriented.position.sub(center);
    holder.scale.setScalar(2 / maxDim);
    scene.add(holder);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(2.6, 2.0, 3.0);
    camera.lookAt(0, 0, 0);

    try {
        gl.render(scene, camera);
        const dataUrl = canvas!.toDataURL('image/png');
        return dataUrl.split(',')[1];
    } finally {
        disposeObject(object);
    }
}

/** Registers this window as the thumbnail render worker. Returns an unsubscribe function. */
export function startThumbnailRenderer(): () => void {
    const api = window.electronAPI;
    if (!api?.onThumbnailRender) return () => {};

    const unsubscribe = api.onThumbnailRender(async (request: ThumbnailRenderRequest) => {
        try {
            const imageData = await renderThumbnail(request.modelId, request.fileType);
            api.sendThumbnailResult({ jobId: request.jobId, ok: true, imageData });
        } catch (error) {
            api.sendThumbnailResult({
                jobId: request.jobId,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    api.thumbnailRendererReady();
    return unsubscribe;
}
