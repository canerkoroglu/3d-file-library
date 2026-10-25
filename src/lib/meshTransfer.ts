/**
 * A plain-data form of a three.js object tree, so meshes parsed in a Web Worker can be sent to the
 * page with their vertex buffers transferred (moved, not copied) and rebuilt there cheaply.
 */
import * as THREE from 'three';

export interface MeshPayload {
    position: Float32Array;
    normal?: Float32Array;
    index?: Uint32Array | Uint16Array;
    /** sRGB colour stored in the file for this mesh (STEP), if any. */
    color?: [number, number, number];
}

export interface MeshNode {
    name?: string;
    /** Local transform, column-major (Matrix4.elements); omitted when identity. */
    matrix?: number[];
    mesh?: MeshPayload;
    children: MeshNode[];
}

function isIdentity(m: THREE.Matrix4): boolean {
    return m.equals(new THREE.Matrix4());
}

function toFloat32(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): Float32Array | undefined {
    if (!attribute) return undefined;
    if (attribute instanceof THREE.BufferAttribute && attribute.array instanceof Float32Array && attribute.itemSize === 3) {
        return attribute.array;
    }
    const out = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) {
        out[i * 3] = attribute.getX(i);
        out[i * 3 + 1] = attribute.getY(i);
        out[i * 3 + 2] = attribute.getZ(i);
    }
    return out;
}

function meshColor(material: THREE.Material | THREE.Material[]): [number, number, number] | undefined {
    const first = Array.isArray(material) ? material[0] : material;
    const color = (first as THREE.Material & { color?: THREE.Color }).color;
    return color ? [color.r, color.g, color.b] : undefined;
}

/**
 * Converts an object tree into transferable data. `keepColors` keeps per-mesh material colours
 * (used for STEP, whose colours come from the CAD file); otherwise the page applies its own material.
 */
export function serializeObject(object: THREE.Object3D, keepColors: boolean): { node: MeshNode; transfer: ArrayBuffer[] } {
    const transfer = new Set<ArrayBuffer>();
    const add = (array: ArrayBufferView | undefined) => {
        if (array && array.buffer instanceof ArrayBuffer) transfer.add(array.buffer);
    };

    const visit = (obj: THREE.Object3D): MeshNode => {
        obj.updateMatrix();
        const node: MeshNode = { children: [] };
        if (obj.name) node.name = obj.name;
        if (!isIdentity(obj.matrix)) node.matrix = obj.matrix.toArray();

        if (obj instanceof THREE.Mesh) {
            const geometry = obj.geometry as THREE.BufferGeometry;
            const position = toFloat32(geometry.getAttribute('position'));
            if (position) {
                const normal = toFloat32(geometry.getAttribute('normal'));
                const indexArray = geometry.getIndex()?.array;
                const index = indexArray instanceof Uint32Array || indexArray instanceof Uint16Array
                    ? indexArray
                    : indexArray ? Uint32Array.from(indexArray as ArrayLike<number>) : undefined;
                node.mesh = { position, normal, index, color: keepColors ? meshColor(obj.material) : undefined };
                add(position);
                add(normal);
                add(index);
            }
        }
        for (const child of obj.children) node.children.push(visit(child));
        return node;
    };

    const node = visit(object);
    return { node, transfer: [...transfer] };
}

/** Rebuilds the object tree on the page. Meshes without a stored colour get `makeMaterial()`. */
export function deserializeObject(node: MeshNode, makeMaterial: () => THREE.Material): THREE.Object3D {
    let object: THREE.Object3D;
    if (node.mesh) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(node.mesh.position, 3));
        if (node.mesh.index) geometry.setIndex(new THREE.BufferAttribute(node.mesh.index, 1));
        if (node.mesh.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(node.mesh.normal, 3));
        else geometry.computeVertexNormals();
        const material = node.mesh.color
            ? new THREE.MeshStandardMaterial({ color: new THREE.Color(...node.mesh.color), roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide })
            : makeMaterial();
        object = new THREE.Mesh(geometry, material);
    } else {
        object = new THREE.Group();
    }
    if (node.name) object.name = node.name;
    if (node.matrix) {
        object.matrix.fromArray(node.matrix);
        object.matrix.decompose(object.position, object.quaternion, object.scale);
    }
    for (const child of node.children) object.add(deserializeObject(child, makeMaterial));
    return object;
}
