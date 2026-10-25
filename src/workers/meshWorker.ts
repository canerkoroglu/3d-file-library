/**
 * Parses 3D files off the page's main thread. The worker fetches the file itself from the
 * model:// protocol (streamed from disk by the main process), so the bytes never pass through
 * the UI thread, then sends back plain mesh data with its buffers transferred.
 *
 * Handles STL, OBJ, STEP and multi-part ("production extension") 3MF. Formats whose loaders need
 * the DOM (stock 3MF with colours, glTF textures, USDZ) are parsed on the page instead.
 */
import * as THREE from 'three';
import { OBJLoader, STLLoader } from 'three-stdlib';
import { serializeObject } from '../lib/meshTransfer';
import type { MeshWorkerRequest, MeshWorkerResponse } from '../lib/meshWorkerProtocol';

async function parse(buffer: ArrayBuffer, format: MeshWorkerRequest['format']): Promise<THREE.Object3D> {
    switch (format) {
        case 'stl': {
            const geometry = new STLLoader().parse(buffer);
            // Many exporters write zero facet normals; smooth normals look right and match the viewer's past output.
            geometry.computeVertexNormals();
            return new THREE.Mesh(geometry);
        }
        case 'obj':
            return new OBJLoader().parse(new TextDecoder().decode(buffer));
        case 'step': {
            const { loadStepObject } = await import('../lib/step');
            return loadStepObject(buffer);
        }
        case '3mf-parts': {
            const { loadThreeMfObject } = await import('../lib/threeMf');
            return loadThreeMfObject(buffer);
        }
    }
}

self.onmessage = async (event: MessageEvent<MeshWorkerRequest>) => {
    const request = event.data;
    try {
        const response = await fetch(request.url);
        if (!response.ok) throw new Error(`Could not read the file (${response.status}).`);
        const buffer = await response.arrayBuffer();
        const object = await parse(buffer, request.format);
        const { node, transfer } = serializeObject(object, request.format === 'step');
        const message: MeshWorkerResponse = { id: request.id, ok: true, node };
        (self as unknown as Worker).postMessage(message, transfer);
    } catch (error) {
        const message: MeshWorkerResponse = { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
        (self as unknown as Worker).postMessage(message);
    }
};
