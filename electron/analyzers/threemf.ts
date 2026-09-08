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

function decodeEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
}

/** Parses the core 3MF model XML with regexes; meshes can be tens of MB so a DOM is avoided. */
export function analyzeModelXml(xml: string): { geometry: GeometryStats | null; metadata: Record<string, string> } {
    const metadata: Record<string, string> = {};
    for (const match of xml.matchAll(METADATA_RE)) {
        metadata[match[1]] = decodeEntities(match[2]);
    }

    const acc = new GeometryAccumulator();
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

    return { geometry: meshes > 0 ? acc.result() : null, metadata };
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

    let geometry: GeometryStats | null = null;
    let coreMeta: Record<string, string> = {};
    const modelFile = zip.file(modelPath) ?? zip.file(/\.model$/i)[0];
    if (modelFile) {
        const xml = await modelFile.async('string');
        const analysed = analyzeModelXml(xml);
        geometry = analysed.geometry;
        coreMeta = analysed.metadata;
    }

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
