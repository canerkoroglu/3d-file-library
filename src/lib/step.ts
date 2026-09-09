/**
 * STEP (.step/.stp) loader. STEP is a CAD boundary-representation format, not a mesh, so it
 * must be tessellated by a CAD kernel — here occt-import-js (OpenCASCADE compiled to WASM).
 * The ~7.6 MB WASM is loaded lazily (only when a STEP file is first opened) and the initialised
 * module is cached for the session. Runs in the renderer (viewer and thumbnail contexts).
 */
import * as THREE from 'three';
import occtimportjs, { type OcctModule } from 'occt-import-js';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

let modulePromise: Promise<OcctModule> | null = null;

/**
 * Fetches the WASM bytes via XHR. In the packaged app the renderer runs on file://, where
 * Chromium blocks fetch() (which Emscripten would use by default) but XHR still works; we
 * then hand the bytes to the module as `wasmBinary` so it never has to fetch them itself.
 */
function loadWasmBinary(url: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => (xhr.status === 0 || xhr.status === 200 ? resolve(xhr.response as ArrayBuffer) : reject(new Error(`Could not load the STEP engine (${xhr.status}).`)));
        xhr.onerror = () => reject(new Error('Could not load the STEP engine.'));
        xhr.send();
    });
}

function getOcct(): Promise<OcctModule> {
    if (!modulePromise) {
        modulePromise = loadWasmBinary(occtWasmUrl).then((wasmBinary) => occtimportjs({ wasmBinary, locateFile: () => occtWasmUrl }));
    }
    return modulePromise;
}

export async function loadStepObject(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    const occt = await getOcct();
    const result = occt.ReadStepFile(new Uint8Array(buffer), null);
    if (!result?.success || !result.meshes?.length) {
        throw new Error('Could not read any geometry from the STEP file.');
    }

    const group = new THREE.Group();
    for (const mesh of result.meshes) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
        if (mesh.attributes.normal) {
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
        }
        if (mesh.index) geometry.setIndex(mesh.index.array);
        if (!mesh.attributes.normal) geometry.computeVertexNormals();

        const color = mesh.color
            ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
            : new THREE.Color('#3b82f6');
        group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide })));
    }
    return group;
}
