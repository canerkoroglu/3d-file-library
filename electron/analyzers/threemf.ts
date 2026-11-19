import fs from 'fs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { GeometryAccumulator } from './geometry';
import type { GeometryStats } from './types';
import type { PrintMetadata } from '../../src/types';

export interface ThreeMfAnalysis {
    geometry: GeometryStats | null;
    printMeta: PrintMetadata | null;
    /** Raw bytes of an embedded preview image, if any. */
    thumbnail: Buffer | null;
}

const THUMBNAIL_CANDIDATES = [
    /^Metadata\/thumbnail\.(png|jpe?g)$/i,
    /^Thumbnails\/thumbnail\.(png|jpe?g)$/i,
    /^Metadata\/plate_1\.png$/i,
    /^Metadata\/plate_1_small\.png$/i,
    /^Metadata\/.*thumbnail.*\.(png|jpe?g)$/i,
];

const VERTEX_RE = /<vertex\s+[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*z="([^"]+)"/g;
const TRIANGLE_RE = /<triangle\s+[^>]*v1="(\d+)"[^>]*v2="(\d+)"[^>]*v3="(\d+)"/g;
const METADATA_RE = /<metadata\s+name="([^"]+)"[^>]*>([^<]*)<\/metadata>/g;
const MESH_RE = /<mesh\b[\s\S]*?<\/mesh>/g;
const OBJECT_RE = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
const COMPONENT_RE = /<component\b([^>]*?)\/?>/g;
const BUILD_RE = /<build\b[^>]*>([\s\S]*?)<\/build>/;
const ITEM_RE = /<item\b([^>]*?)\/?>/g;

function decodeEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
}

function extractMetadata(xml: string): Record<string, string> {
    const metadata: Record<string, string> = {};
    for (const match of xml.matchAll(METADATA_RE)) {
        metadata[match[1]] = decodeEntities(match[2]);
    }
    return metadata;
}

/**
 * Affine 3×4 matrix in row-major order for column vectors: rows are
 * [m0 m1 m2 m3], [m4 m5 m6 m7], [m8 m9 m10 m11]; x' = m0·x + m1·y + m2·z + m3, etc.
 */
type Affine = readonly number[];

const IDENTITY: Affine = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** Millimetres per 3MF model unit. */
const UNIT_SCALE: Record<string, number> = {
    micron: 0.001,
    millimeter: 1,
    centimeter: 10,
    inch: 25.4,
    foot: 304.8,
    meter: 1000,
};

function unitScale(xml: string): number {
    const m = xml.match(/<model\b([^>]*)>/);
    const unit = m ? attr(m[1], 'unit') : undefined;
    return (unit && UNIT_SCALE[unit.toLowerCase()]) || 1;
}

/** Parses a 3MF `transform` (m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32, row-vector form). */
function parseTransform(value: string | undefined): Affine | undefined {
    if (!value) return undefined;
    const t = value.trim().split(/\s+/).map(Number);
    if (t.length < 12 || t.some((n) => !Number.isFinite(n))) return undefined;
    return [t[0], t[3], t[6], t[9], t[1], t[4], t[7], t[10], t[2], t[5], t[8], t[11]];
}

/** a · b (apply b first, then a). */
function multiply(a: Affine, b: Affine): Affine {
    const out = new Array<number>(12);
    for (let r = 0; r < 3; r++) {
        const a0 = a[r * 4], a1 = a[r * 4 + 1], a2 = a[r * 4 + 2], a3 = a[r * 4 + 3];
        out[r * 4] = a0 * b[0] + a1 * b[4] + a2 * b[8];
        out[r * 4 + 1] = a0 * b[1] + a1 * b[5] + a2 * b[9];
        out[r * 4 + 2] = a0 * b[2] + a1 * b[6] + a2 * b[10];
        out[r * 4 + 3] = a0 * b[3] + a1 * b[7] + a2 * b[11] + a3;
    }
    return out;
}

/** Scrapes every <mesh> in the XML fragment into the accumulator, transformed by `m`; returns the number of meshes. */
function accumulateMeshes(xml: string, acc: GeometryAccumulator, m: Affine = IDENTITY): number {
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    let meshes = 0;
    // A mirroring transform flips winding; swap two vertices so signed volumes don't cancel.
    const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
    const flip = det < 0;

    // Vertex indices are local to each <mesh>, so reset the vertex table per mesh.
    for (const mesh of xml.matchAll(MESH_RE)) {
        meshes++;
        const body = mesh[0];
        xs.length = 0; ys.length = 0; zs.length = 0;
        for (const v of body.matchAll(VERTEX_RE)) {
            const x = parseFloat(v[1]);
            const y = parseFloat(v[2]);
            const z = parseFloat(v[3]);
            xs.push(m[0] * x + m[1] * y + m[2] * z + m[3]);
            ys.push(m[4] * x + m[5] * y + m[6] * z + m[7]);
            zs.push(m[8] * x + m[9] * y + m[10] * z + m[11]);
        }
        for (const t of body.matchAll(TRIANGLE_RE)) {
            const a = parseInt(t[1], 10);
            let b = parseInt(t[2], 10);
            let c = parseInt(t[3], 10);
            if (a >= xs.length || b >= xs.length || c >= xs.length) continue;
            if (flip) [b, c] = [c, b];
            acc.addTriangle(xs[a], ys[a], zs[a], xs[b], ys[b], zs[b], xs[c], ys[c], zs[c]);
        }
    }
    return meshes;
}

/** Parses one 3MF model part with regexes; meshes can be tens of MB so a DOM is avoided. */
export function analyzeModelXml(xml: string): { geometry: GeometryStats | null; metadata: Record<string, string> } {
    const root = 'model';
    return { geometry: aggregateGeometry(new Map([[root, xml]]), root), metadata: extractMetadata(xml) };
}

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

function normalizePath(p: string): string {
    return p.replace(/^\/+/, '');
}

interface PartRef {
    objectId: string;
    /** Model part the object lives in (production extension); undefined = same part. */
    path?: string;
    transform?: Affine;
}
interface PartObject {
    /** The `<object>` body when it holds a mesh directly. */
    meshBody?: string;
    components?: PartRef[];
}
interface ParsedPart {
    objects: Map<string, PartObject>;
    build: PartRef[];
}

/** Parses a model part's objects (mesh or components) and build items, with their transforms. */
function parseModelParts(xml: string): ParsedPart {
    const objects = new Map<string, PartObject>();
    for (const match of xml.matchAll(OBJECT_RE)) {
        const id = attr(match[1], 'id');
        if (!id) continue;
        const body = match[2];
        if (/<mesh\b/.test(body)) {
            objects.set(id, { meshBody: body });
        } else if (/<component\b/.test(body)) {
            const components: PartRef[] = [];
            for (const c of body.matchAll(COMPONENT_RE)) {
                const objectId = attr(c[1], 'objectid');
                if (objectId) components.push({ objectId, path: pathAttr(c[1]), transform: parseTransform(attr(c[1], 'transform')) });
            }
            objects.set(id, { components });
        } else {
            objects.set(id, {});
        }
    }

    const build: PartRef[] = [];
    const buildMatch = xml.match(BUILD_RE);
    if (buildMatch) {
        for (const item of buildMatch[1].matchAll(ITEM_RE)) {
            const objectId = attr(item[1], 'objectid');
            if (objectId) build.push({ objectId, path: pathAttr(item[1]), transform: parseTransform(attr(item[1], 'transform')) });
        }
    }
    return { objects, build };
}

/**
 * Sums geometry across every model part, following build items and components — including
 * cross-part `p:path` references from the 3MF production extension — so only built objects are
 * counted, each placed instance once with its item/component transforms applied (object ids are
 * resolved per part, so ids that collide across parts are kept distinct). The root's `unit` is
 * converted to millimetres. Falls back to scraping every mesh when nothing resolves.
 */
function aggregateGeometry(parts: Map<string, string>, rootPath: string): GeometryStats | null {
    const acc = new GeometryAccumulator();
    const parsed = new Map<string, ParsedPart>();
    const getPart = (p: string): ParsedPart => {
        let part = parsed.get(p);
        if (!part) {
            part = parseModelParts(parts.get(p) ?? '');
            parsed.set(p, part);
        }
        return part;
    };
    const s = unitScale(parts.get(rootPath) ?? '');
    const units: Affine = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0];

    const resolve = (partPath: string, objectId: string, matrix: Affine, stack: Set<string>): void => {
        const key = `${partPath}#${objectId}`;
        if (stack.has(key)) return; // guard against a component cycle
        const object = getPart(partPath).objects.get(objectId);
        if (!object) return;
        if (object.meshBody !== undefined) {
            accumulateMeshes(object.meshBody, acc, matrix);
            return;
        }
        const next = new Set(stack).add(key);
        for (const component of object.components ?? []) {
            const childMatrix = component.transform ? multiply(matrix, component.transform) : matrix;
            resolve(component.path ? normalizePath(component.path) : partPath, component.objectId, childMatrix, next);
        }
    };

    for (const item of getPart(rootPath).build) {
        const matrix = item.transform ? multiply(units, item.transform) : units;
        resolve(item.path ? normalizePath(item.path) : rootPath, item.objectId, matrix, new Set());
    }

    // Nothing resolved (no build section, or unresolved references): fall back to every mesh.
    if (acc.triangleCount === 0) {
        for (const xml of parts.values()) accumulateMeshes(xml, acc, units);
    }
    return acc.result();
}

type KeyValue = { key?: string; value?: string };

function asArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

export function parseSlicerConfigs(files: Record<string, string>): Partial<PrintMetadata> {
    const meta: Partial<PrintMetadata> = {};

    // Bambu Studio / OrcaSlicer project settings (JSON).
    const projectSettings = files['Metadata/project_settings.config'];
    if (projectSettings) {
        try {
            const json = JSON.parse(projectSettings) as Record<string, unknown>;
            meta.slicer = 'Bambu Studio';
            if (typeof json.printer_model === 'string') meta.printerModel = json.printer_model;
            if (Array.isArray(json.filament_type)) meta.filamentTypes = [...new Set(json.filament_type.map(String))];
            if (typeof json.layer_height === 'string' || typeof json.layer_height === 'number') {
                meta.layerHeight = parseFloat(String(json.layer_height));
            }
        } catch {
            // ignore malformed settings
        }
    }

    // Bambu slice info (XML).
    const sliceInfo = files['Metadata/slice_info.config'];
    if (sliceInfo) {
        try {
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
            const parsed = parser.parse(sliceInfo) as {
                config?: {
                    header?: { header_item?: KeyValue | KeyValue[] };
                    plate?: { metadata?: KeyValue | KeyValue[] } | Array<{ metadata?: KeyValue | KeyValue[] }>;
                };
            };
            for (const item of asArray(parsed.config?.header?.header_item)) {
                if (item.key === 'X-BBL-Client-Type' && !meta.slicer) meta.slicer = 'Bambu Studio';
            }
            for (const plate of asArray(parsed.config?.plate)) {
                for (const m of asArray(plate.metadata)) {
                    if (m.key === 'printer_model_id' && !meta.printerModel) meta.printerModel = m.value;
                }
            }
        } catch {
            // ignore malformed slice info
        }
    }

    // PrusaSlicer project config (ini-style lines prefixed with ';').
    const prusaConfig = files['Metadata/Slic3r_PE.config'];
    if (prusaConfig) {
        meta.slicer = meta.slicer ?? 'PrusaSlicer';
        const get = (key: string): string | undefined => {
            const m = prusaConfig.match(new RegExp(`^;\\s*${key}\\s*=\\s*(.+)$`, 'm'));
            return m ? m[1].trim() : undefined;
        };
        const printer = get('printer_model');
        if (printer && !meta.printerModel) meta.printerModel = printer;
        const filament = get('filament_type');
        if (filament && !meta.filamentTypes) {
            meta.filamentTypes = [...new Set(filament.split(';').map((s) => s.trim()).filter(Boolean))];
        }
        const layer = get('layer_height');
        if (layer && meta.layerHeight === undefined) meta.layerHeight = parseFloat(layer);
    }

    return meta;
}

export async function analyzeThreeMf(filepath: string): Promise<ThreeMfAnalysis> {
    const data = await fs.promises.readFile(filepath);
    const zip = await JSZip.loadAsync(data);

    // Locate the model part via the package relationships, falling back to the conventional path.
    let modelPath = '3D/3dmodel.model';
    const rels = zip.file('_rels/.rels');
    if (rels) {
        const relsXml = await rels.async('string');
        const match = relsXml.match(/Target="\/?([^"]+\.model)"[^>]*Type="[^"]*3dmodel"/i)
            ?? relsXml.match(/Type="[^"]*3dmodel"[^>]*Target="\/?([^"]+\.model)"/i);
        if (match) modelPath = match[1];
    }

    // Read every model part: slicers split geometry into 3D/Objects/*.model (production extension).
    const parts = new Map<string, string>();
    for (const file of zip.file(/\.model$/i)) {
        parts.set(normalizePath(file.name), await file.async('string'));
    }
    const rootPath = normalizePath(modelPath);
    const rootXml = parts.get(rootPath) ?? parts.values().next().value ?? '';
    const coreMeta = extractMetadata(rootXml);
    const geometry = aggregateGeometry(parts, rootPath);

    const configNames = ['Metadata/project_settings.config', 'Metadata/slice_info.config', 'Metadata/Slic3r_PE.config'];
    const configs: Record<string, string> = {};
    for (const name of configNames) {
        const file = zip.file(name);
        if (file) configs[name] = await file.async('string');
    }

    const printMeta: PrintMetadata = { ...parseSlicerConfigs(configs) };
    if (coreMeta.Title) printMeta.title = coreMeta.Title;
    if (coreMeta.Designer) printMeta.designer = coreMeta.Designer;
    if (coreMeta.Description) printMeta.description = coreMeta.Description;
    if (coreMeta.LicenseTerms) printMeta.license = coreMeta.LicenseTerms;
    if (coreMeta.Application && !printMeta.slicer) printMeta.slicer = coreMeta.Application;

    let thumbnail: Buffer | null = null;
    for (const pattern of THUMBNAIL_CANDIDATES) {
        const file = zip.file(pattern)[0];
        if (file) {
            thumbnail = await file.async('nodebuffer');
            break;
        }
    }

    return {
        geometry,
        printMeta: Object.keys(printMeta).length > 0 ? printMeta : null,
        thumbnail,
    };
}
