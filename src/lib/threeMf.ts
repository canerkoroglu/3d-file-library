/**
 * Fallback 3MF loader for the 3MF *production extension*, which slicers (Bambu
 * Studio, OrcaSlicer, PrusaSlicer) use to split geometry into separate model
 * parts (e.g. `3D/Objects/object_1.model`) referenced from the root model by a
 * `p:path`. three.js / three-stdlib's ThreeMFLoader only resolves objects inside
 * a single model part, so those files make it throw "Cannot read properties of
 * undefined (reading 'mesh')". We resolve the cross-part references here.
 *
 * Meshes can be large, so — like the indexer's analyzer — geometry is scraped
 * with regexes rather than built into a DOM. Colours/materials are not carried
 * over (these files render in the viewer's uniform colour); the aim is to make
 * the model visible, which the stock loader fails to do at all.
 */
import * as THREE from 'three';
import JSZip from 'jszip';

const VERTEX_RE = /<vertex\s+[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*z="([^"]+)"/g;
const TRIANGLE_RE = /<triangle\s+[^>]*v1="(\d+)"[^>]*v2="(\d+)"[^>]*v3="(\d+)"/g;
const OBJECT_RE = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
const COMPONENT_RE = /<component\b([^>]*?)\/?>/g;
const BUILD_RE = /<build\b[^>]*>([\s\S]*?)<\/build>/;
const ITEM_RE = /<item\b([^>]*?)\/?>/g;

/** Reads an unprefixed attribute, guarding against matching a longer name's suffix (e.g. `id` in `objectid`). */
function attr(attrs: string, name: string): string | undefined {
    const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`));
    return m ? m[1] : undefined;
}

/** The production-extension path attribute, tolerating any namespace prefix (`p:path`, `path`, …). */
function pathAttr(attrs: string): string | undefined {
    const m = attrs.match(/(?:^|\s)(?:[A-Za-z0-9]+:)?path="([^"]+)"/);
    return m ? m[1] : undefined;
}

/** 3MF stores a 4×3 row-major affine; lay it into a column-major Matrix4 exactly as ThreeMFLoader does. */
function parseTransform(value: string | undefined): THREE.Matrix4 | undefined {
    if (!value) return undefined;
    const t = value.trim().split(/\s+/).map(Number);
    if (t.length < 12 || t.some((n) => !Number.isFinite(n))) return undefined;
    return new THREE.Matrix4().set(
        t[0], t[3], t[6], t[9],
        t[1], t[4], t[7], t[10],
        t[2], t[5], t[8], t[11],
        0, 0, 0, 1,
    );
}

interface MeshData {
    vertices: Float32Array;
    indices: number[];
}
interface Ref {
    objectId: string;
    /** Model part the object lives in (production extension); undefined = same part. */
    path?: string;
    transform?: THREE.Matrix4;
}
interface PartObject {
    mesh?: MeshData;
    components?: Ref[];
}
export interface ParsedPart {
    objects: Map<string, PartObject>;
    build: Ref[];
}

/** Parses one `.model` part into its objects (mesh or components) and build items. */
export function parseModelPart(xml: string): ParsedPart {
    const objects = new Map<string, PartObject>();
    for (const match of xml.matchAll(OBJECT_RE)) {
        const objAttrs = match[1];
        const body = match[2];
        const id = attr(objAttrs, 'id');
        if (!id) continue;

        if (/<mesh\b/.test(body)) {
            const xs: number[] = [];
            const ys: number[] = [];
            const zs: number[] = [];
            for (const v of body.matchAll(VERTEX_RE)) {
                xs.push(parseFloat(v[1]));
                ys.push(parseFloat(v[2]));
                zs.push(parseFloat(v[3]));
            }
            const vertices = new Float32Array(xs.length * 3);
            for (let i = 0; i < xs.length; i++) {
                vertices[i * 3] = xs[i];
                vertices[i * 3 + 1] = ys[i];
                vertices[i * 3 + 2] = zs[i];
            }
            const indices: number[] = [];
            for (const t of body.matchAll(TRIANGLE_RE)) {
                const a = parseInt(t[1], 10);
                const b = parseInt(t[2], 10);
                const c = parseInt(t[3], 10);
                if (a < xs.length && b < xs.length && c < xs.length) indices.push(a, b, c);
            }
            objects.set(id, { mesh: { vertices, indices } });
        } else if (/<component\b/.test(body)) {
            const components: Ref[] = [];
            for (const c of body.matchAll(COMPONENT_RE)) {
                const compAttrs = c[1];
                const objectId = attr(compAttrs, 'objectid');
                if (!objectId) continue;
                components.push({ objectId, path: pathAttr(compAttrs), transform: parseTransform(attr(compAttrs, 'transform')) });
            }
            objects.set(id, { components });
        } else {
            objects.set(id, {});
        }
    }

    const build: Ref[] = [];
    const buildMatch = xml.match(BUILD_RE);
    if (buildMatch) {
        for (const item of buildMatch[1].matchAll(ITEM_RE)) {
            const itemAttrs = item[1];
            const objectId = attr(itemAttrs, 'objectid');
            if (!objectId) continue;
            build.push({ objectId, path: pathAttr(itemAttrs), transform: parseTransform(attr(itemAttrs, 'transform')) });
        }
    }

    return { objects, build };
}

function normalizePath(path: string): string {
    return path.replace(/^\/+/, '');
}

function makeMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: '#3b82f6', roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide });
}

/** Resolves build items and (cross-part) components into a THREE object graph. */
export function assembleThreeMf(parts: Map<string, ParsedPart>, rootPath: string): { object: THREE.Object3D; meshCount: number } {
    let meshCount = 0;

    const resolve = (partPath: string, objectId: string, stack: Set<string>): THREE.Object3D | null => {
        const key = `${partPath}#${objectId}`;
        if (stack.has(key)) return null; // guard against a component cycle
        const object = parts.get(partPath)?.objects.get(objectId);
        if (!object) return null;

        if (object.mesh) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(object.mesh.vertices, 3));
            if (object.mesh.indices.length) geometry.setIndex(object.mesh.indices);
            geometry.computeVertexNormals();
            meshCount++;
            return new THREE.Mesh(geometry, makeMaterial());
        }

        if (object.components?.length) {
            const group = new THREE.Group();
            const nextStack = new Set(stack).add(key);
            for (const component of object.components) {
                const childPath = component.path ? normalizePath(component.path) : partPath;
                const child = resolve(childPath, component.objectId, nextStack);
                if (!child) continue;
                if (component.transform) child.applyMatrix4(component.transform);
                group.add(child);
            }
            return group;
        }

        return null;
    };

    const root = new THREE.Group();
    for (const item of parts.get(rootPath)?.build ?? []) {
        const itemPath = item.path ? normalizePath(item.path) : rootPath;
        const child = resolve(itemPath, item.objectId, new Set());
        if (!child) continue;
        if (item.transform) child.applyMatrix4(item.transform);
        root.add(child);
    }

    return { object: root, meshCount };
}

/** Loads a 3MF (including production-extension multi-part files) into a THREE object. */
export async function loadThreeMfObject(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    const zip = await JSZip.loadAsync(buffer);
    const parts = new Map<string, ParsedPart>();
    for (const file of zip.file(/\.model$/i)) {
        parts.set(normalizePath(file.name), parseModelPart(await file.async('string')));
    }

    // Root model part: the one named in the package relationships, else the convention, else whatever has build items.
    let rootPath = '3D/3dmodel.model';
    const rels = zip.file('_rels/.rels');
    if (rels) {
        const relsXml = await rels.async('string');
        const match = relsXml.match(/Target="\/?([^"]+\.model)"[^>]*Type="[^"]*3dmodel"/i)
            ?? relsXml.match(/Type="[^"]*3dmodel"[^>]*Target="\/?([^"]+\.model)"/i);
        if (match) rootPath = normalizePath(match[1]);
    }
    if (!parts.get(rootPath)?.build.length) {
        for (const [path, part] of parts) {
            if (part.build.length > 0) {
                rootPath = path;
                break;
            }
        }
    }

    const { object, meshCount } = assembleThreeMf(parts, rootPath);
    if (meshCount === 0) throw new Error('No renderable geometry found in this 3MF file.');
    return object;
}
