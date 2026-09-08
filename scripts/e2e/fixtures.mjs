// Generates a small but varied model library for the end-to-end tests:
// binary and ASCII STL, OBJ, a 3MF with project metadata and an embedded thumbnail,
// a Thingiverse-style folder with README/images, a duplicate, and enough files to page.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';

export const PAGE_FILLER_COUNT = 250;
export const FILLER_WORDS = ['bracket', 'benchy', 'vase', 'gear', 'hinge', 'knob', 'clip', 'mount', 'holder', 'lid'];

function boxTriangles(w, d, h) {
    const x = w / 2, y = d / 2, z = h / 2;
    const v = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
    const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    return faces.map(([a, b, c]) => [...v[a], ...v[b], ...v[c]]);
}

function pyramidTriangles(size, height) {
    const s = size / 2;
    const apex = [0, 0, height];
    const base = [[-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0]];
    const tris = [[...base[0], ...base[2], ...base[1]], [...base[0], ...base[3], ...base[2]]];
    for (let i = 0; i < 4; i++) tris.push([...base[i], ...base[(i + 1) % 4], ...apex]);
    return tris;
}

export function binaryStl(triangles, header = 'e2e sample') {
    const buffer = Buffer.alloc(84 + triangles.length * 50);
    buffer.write(header, 0, 'ascii');
    buffer.writeUInt32LE(triangles.length, 80);
    triangles.forEach((t, i) => {
        const base = 84 + i * 50;
        t.forEach((value, k) => buffer.writeFloatLE(value, base + 12 + k * 4));
    });
    return buffer;
}

export function asciiStl(triangles) {
    const lines = ['solid sample'];
    for (const t of triangles) {
        lines.push('  facet normal 0 0 0', '    outer loop');
        for (let k = 0; k < 3; k++) lines.push(`      vertex ${t[k * 3]} ${t[k * 3 + 1]} ${t[k * 3 + 2]}`);
        lines.push('    endloop', '  endfacet');
    }
    lines.push('endsolid sample');
    return lines.join('\n');
}

async function threeMf({ title, designer, printer, filament, layerHeight, thumbnailColor }) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="png" ContentType="image/png"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
    const tris = pyramidTriangles(20, 35);
    const verts = [];
    const index = new Map();
    const faces = [];
    for (const t of tris) {
        const ids = [];
        for (let k = 0; k < 3; k++) {
            const key = t.slice(k * 3, k * 3 + 3).join(',');
            if (!index.has(key)) {
                index.set(key, verts.length);
                verts.push(t.slice(k * 3, k * 3 + 3));
            }
            ids.push(index.get(key));
        }
        faces.push(ids);
    }
    zip.file('3D/3dmodel.model', `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${title}</metadata><metadata name="Designer">${designer}</metadata><resources><object id="1" type="model"><mesh><vertices>${verts.map((v) => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join('')}</vertices><triangles>${faces.map((f) => `<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`).join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`);
    zip.file('Metadata/project_settings.config', JSON.stringify({ printer_model: printer, filament_type: [filament], layer_height: String(layerHeight) }));
    zip.file('Metadata/thumbnail.png', await sharp({ create: { width: 160, height: 160, channels: 3, background: thumbnailColor } }).png().toBuffer());
    return zip.generateAsync({ type: 'nodebuffer' });
}

/** Writes the sample library into `root` and returns what the tests should expect to find. */
export async function createLibrary(root) {
    for (const dir of ['dragon/files', 'dragon/images', 'misc', 'many']) fs.mkdirSync(path.join(root, dir), { recursive: true });

    fs.writeFileSync(path.join(root, 'dragon/files/dragon_body.stl'), binaryStl(pyramidTriangles(40, 60)));
    fs.writeFileSync(path.join(root, 'dragon/files/dragon_wing.stl'), asciiStl(boxTriangles(10, 30, 2)));
    fs.writeFileSync(path.join(root, 'dragon/README.txt'), 'Articulated dragon by Test Designer.\nhttps://www.thingiverse.com/thing:3210987\nPrint at 0.2mm, no supports.\nLicensed under CC BY-NC-SA 4.0\n');
    await sharp({ create: { width: 200, height: 120, channels: 3, background: '#b45309' } }).png().toFile(path.join(root, 'dragon/images/dragon_body_front.png'));

    fs.writeFileSync(path.join(root, 'misc/bracket_v2.obj'), ['# bracket', 'v 0 0 0', 'v 25 0 0', 'v 25 12 0', 'v 0 12 0', 'v 0 0 8', 'v 25 0 8', 'f 1 2 3 4', 'f 1 2 6 5', 'f 4 3 6 5'].join('\n'));
    fs.writeFileSync(path.join(root, 'misc/cone.3mf'), await threeMf({ title: 'Vase Mode Cone', designer: 'Cone Person', printer: 'Bambu Lab P1S', filament: 'PETG', layerHeight: 0.16, thumbnailColor: '#15803d' }));
    fs.copyFileSync(path.join(root, 'dragon/files/dragon_body.stl'), path.join(root, 'misc/copy_of_dragon.stl'));

    for (let i = 1; i <= PAGE_FILLER_COUNT; i++) {
        const word = FILLER_WORDS[i % FILLER_WORDS.length];
        const size = 5 + (i % 40) * 3;
        fs.writeFileSync(path.join(root, 'many', `part_${String(i).padStart(4, '0')}_${word}.stl`), binaryStl(boxTriangles(size, size * 0.6, size * 0.4)));
    }

    return {
        totalModels: 5 + PAGE_FILLER_COUNT,
        benchyCount: Array.from({ length: PAGE_FILLER_COUNT }, (_, i) => FILLER_WORDS[(i + 1) % FILLER_WORDS.length]).filter((w) => w === 'benchy').length,
    };
}

/** A Thingiverse-style download: wrapper directory, files/ and images/, README with the thing URL, macOS junk. */
export async function createThingiverseZip(outPath) {
    const zip = new JSZip();
    const wrapper = 'Articulated_Dragon_v2-3210987';
    zip.file(`${wrapper}/files/dragon_head.stl`, binaryStl(boxTriangles(30, 20, 25)));
    zip.file(`${wrapper}/files/dragon_tail.stl`, binaryStl(boxTriangles(60, 8, 8)));
    zip.file(`${wrapper}/README.txt`, 'Articulated Dragon v2 by Someone\n\nhttps://www.thingiverse.com/thing:3210987\n\nLicense: Creative Commons - Attribution - Non-Commercial (CC BY-NC)\n');
    zip.file(`${wrapper}/LICENSE.txt`, 'Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)');
    zip.file(`${wrapper}/images/dragon_head_photo.jpg`, await sharp({ create: { width: 120, height: 90, channels: 3, background: '#7c3aed' } }).jpeg().toBuffer());
    zip.file(`__MACOSX/${wrapper}/files/._dragon_head.stl`, Buffer.from('junk'));
    fs.writeFileSync(outPath, await zip.generateAsync({ type: 'nodebuffer' }));
    return { models: 2, extracted: 5 };
}
