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

/** Scrapes every <mesh> in the XML fragment into the accumulator; returns the number of meshes. */
function accumulateMeshes(xml: string, acc: GeometryAccumulator): number {
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    let meshes = 0;

    // Vertex indices are local to each <mesh>, so reset the vertex table per mesh.
    for (const mesh of xml.matchAll(MESH_RE)) {
        meshes++;
        const body = mesh[0];
        xs.length = 0; ys.length = 0; zs.length = 0;
        for (const v of body.matchAll(VERTEX_RE)) {
            xs.push(parseFloat(v[1]));
            ys.push(parseFloat(v[2]));
            zs.push(parseFloat(v[3]));
        }
        for (const t of body.matchAll(TRIANGLE_RE)) {
            const a = parseInt(t[1], 10);
            const b = parseInt(t[2], 10);
            const c = parseInt(t[3], 10);
            if (a >= xs.length || b >= xs.length || c >= xs.length) continue;
            acc.addTriangle(xs[a], ys[a], zs[a], xs[b], ys[b], zs[b], xs[c], ys[c], zs[c]);
        }
    }
    return meshes;
}

/** Parses one 3MF model part with regexes; meshes can be tens of MB so a DOM is avoided. */
export function analyzeModelXml(xml: string): { geometry: GeometryStats | null; metadata: Record<string, string> } {
    const acc = new GeometryAccumulator();
    const meshes = accumulateMeshes(xml, acc);
    return { geometry: meshes > 0 ? acc.result() : null, metadata: extractMetadata(xml) };
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

/**
 * Parses a model part's objects (mesh or components) and build items. Transforms are ignored:
 * bounding-box dimensions are translation-invariant, matching the single-part scraping path.
 */
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
                if (objectId) components.push({ objectId, path: pathAttr(c[1]) });
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
            if (objectId) build.push({ objectId, path: pathAttr(item[1]) });
        }
    }
    return { objects, build };
}

/**
 * Sums geometry across every model part, following build items and components — including
 * cross-part `p:path` references from the 3MF production extension — so only built objects are
 * counted, each once (object ids are resolved per part, so ids that collide across parts are
 * kept distinct). Falls back to scraping every mesh when nothing resolves (e.g. no build items).
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

    const counted = new Set<string>();
    const resolve = (partPath: string, objectId: string, stack: Set<string>): void => {
        const key = `${partPath}#${objectId}`;
        if (stack.has(key)) return; // guard against a component cycle
        const object = getPart(partPath).objects.get(objectId);
        if (!object) return;
        if (object.meshBody !== undefined) {
            if (!counted.has(key)) {
                counted.add(key);
                accumulateMeshes(object.meshBody, acc);
            }
            return;
        }
        for (const component of object.components ?? []) {
            resolve(component.path ? normalizePath(component.path) : partPath, component.objectId, new Set(stack).add(key));
        }
    };

    for (const item of getPart(rootPath).build) {
        resolve(item.path ? normalizePath(item.path) : rootPath, item.objectId, new Set());
    }

    // Nothing resolved (no build section, or unresolved references): fall back to every mesh.
    if (acc.triangleCount === 0) {
        for (const xml of parts.values()) accumulateMeshes(xml, acc);
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
