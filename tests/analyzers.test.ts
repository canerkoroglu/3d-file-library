import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { analyzeStl, isBinaryStl } from '../electron/analyzers/stl';
import { analyzeObj } from '../electron/analyzers/obj';
import { analyzeModelXml, parseSlicerConfigs } from '../electron/analyzers/threemf';
import { detectLicense, findSidecars } from '../electron/analyzers/sidecars';
import { GeometryAccumulator } from '../electron/analyzers/geometry';

let dir: string;

// A 10 x 20 x 30 box centred on the origin, as 12 triangles.
function boxTriangles(w: number, d: number, h: number): number[][] {
    const x = w / 2, y = d / 2, z = h / 2;
    const v = [
        [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
        [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
    ];
    const faces = [
        [0, 2, 1], [0, 3, 2], // bottom
        [4, 5, 6], [4, 6, 7], // top
        [0, 1, 5], [0, 5, 4], // front
        [1, 2, 6], [1, 6, 5], // right
        [2, 3, 7], [2, 7, 6], // back
        [3, 0, 4], [3, 4, 7], // left
    ];
    return faces.map(([a, b, c]) => [...v[a], ...v[b], ...v[c]]);
}

function writeBinaryStl(file: string, triangles: number[][]): void {
    const buffer = Buffer.alloc(84 + triangles.length * 50);
    buffer.write('binary box', 0, 'ascii');
    buffer.writeUInt32LE(triangles.length, 80);
    triangles.forEach((t, i) => {
        const base = 84 + i * 50;
        for (let k = 0; k < 3; k++) buffer.writeFloatLE(0, base + k * 4);
        t.forEach((value, k) => buffer.writeFloatLE(value, base + 12 + k * 4));
        buffer.writeUInt16LE(0, base + 48);
    });
    fs.writeFileSync(file, buffer);
}

function writeAsciiStl(file: string, triangles: number[][]): void {
    const lines = ['solid box'];
    for (const t of triangles) {
        lines.push('  facet normal 0 0 0', '    outer loop');
        for (let k = 0; k < 3; k++) lines.push(`      vertex ${t[k * 3]} ${t[k * 3 + 1]} ${t[k * 3 + 2]}`);
        lines.push('    endloop', '  endfacet');
    }
    lines.push('endsolid box');
    fs.writeFileSync(file, lines.join('\n'));
}

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelist-test-'));
});

afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('STL analyzer', () => {
    const triangles = boxTriangles(10, 20, 30);

    it('measures a binary STL box', async () => {
        const file = path.join(dir, 'box.stl');
        writeBinaryStl(file, triangles);
        const size = fs.statSync(file).size;
        expect(await isBinaryStl(file, size)).toBe(true);
        const stats = await analyzeStl(file, size);
        expect(stats?.triangleCount).toBe(12);
        expect(stats?.bbox).toEqual({ x: 10, y: 20, z: 30 });
        expect(stats?.volume).toBeCloseTo(6000, 3);
    });

    it('measures an ASCII STL box', async () => {
        const file = path.join(dir, 'box-ascii.stl');
        writeAsciiStl(file, triangles);
        const size = fs.statSync(file).size;
        expect(await isBinaryStl(file, size)).toBe(false);
        const stats = await analyzeStl(file, size);
        expect(stats?.triangleCount).toBe(12);
        expect(stats?.bbox).toEqual({ x: 10, y: 20, z: 30 });
        expect(stats?.volume).toBeCloseTo(6000, 3);
    });
});

describe('OBJ analyzer', () => {
    it('counts fan-triangulated faces and measures the bounding box', async () => {
        const file = path.join(dir, 'quad.obj');
        fs.writeFileSync(file, ['# quad', 'v 0 0 0', 'v 4 0 0', 'v 4 2 0', 'v 0 2 1', 'f 1 2 3 4', 'f 1/1 2/2 3/3'].join('\n'));
        const stats = await analyzeObj(file);
        expect(stats?.triangleCount).toBe(3);
        expect(stats?.bbox).toEqual({ x: 4, y: 2, z: 1 });
        expect(stats?.volume).toBeNull();
    });
});

describe('3MF analyzer', () => {
    it('reads metadata and mesh geometry from model XML', () => {
        const xml = `<?xml version="1.0"?>
<model unit="millimeter">
  <metadata name="Title">Test &amp; Part</metadata>
  <metadata name="Designer">Someone</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/><vertex x="2" y="0" z="0"/><vertex x="0" y="3" z="0"/><vertex x="0" y="0" z="4"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/>
        </triangles>
      </mesh>
    </object>
  </resources>
</model>`;
        const result = analyzeModelXml(xml);
        expect(result.metadata.Title).toBe('Test & Part');
        expect(result.metadata.Designer).toBe('Someone');
        expect(result.geometry?.triangleCount).toBe(4);
        expect(result.geometry?.bbox).toEqual({ x: 2, y: 3, z: 4 });
        expect(result.geometry?.volume).toBeCloseTo(4, 3); // tetrahedron: 2*3*4/6
    });

    it('extracts slicer settings from Bambu and Prusa configs', () => {
        const bambu = parseSlicerConfigs({
            'Metadata/project_settings.config': JSON.stringify({ printer_model: 'Bambu Lab X1 Carbon', filament_type: ['PLA', 'PLA', 'PETG'], layer_height: '0.2' }),
        });
        expect(bambu).toEqual({ slicer: 'Bambu Studio', printerModel: 'Bambu Lab X1 Carbon', filamentTypes: ['PLA', 'PETG'], layerHeight: 0.2 });

        const prusa = parseSlicerConfigs({
            'Metadata/Slic3r_PE.config': '; layer_height = 0.15\n; printer_model = MK4\n; filament_type = PLA;PLA\n',
        });
        expect(prusa).toEqual({ slicer: 'PrusaSlicer', printerModel: 'MK4', filamentTypes: ['PLA'], layerHeight: 0.15 });
    });
});

describe('sidecars', () => {
    it('finds README, license and a matching preview image', async () => {
        const folder = path.join(dir, 'thing');
        fs.mkdirSync(path.join(folder, 'files'), { recursive: true });
        fs.mkdirSync(path.join(folder, 'images'));
        fs.writeFileSync(path.join(folder, 'files', 'dragon.stl'), '');
        fs.writeFileSync(path.join(folder, 'files', 'README.txt'), 'Print at 0.2mm. Licensed under CC BY-NC-SA 4.0');
        fs.writeFileSync(path.join(folder, 'images', 'dragon_front.jpg'), '');
        fs.writeFileSync(path.join(folder, 'images', 'aaa.jpg'), '');

        const info = await findSidecars(path.join(folder, 'files', 'dragon.stl'));
        expect(info.readme).toContain('Print at 0.2mm');
        expect(info.license).toBe('CC BY-NC-SA 4.0');
        expect(info.imagePath).toBe(path.join(folder, 'images', 'dragon_front.jpg'));
        expect(info.imageSource).toBe('sidecar');
    });

    it('falls back to a folder image and detects licenses from text', async () => {
        const folder = path.join(dir, 'loose');
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, 'part.stl'), '');
        fs.writeFileSync(path.join(folder, 'photo.png'), '');
        const info = await findSidecars(path.join(folder, 'part.stl'));
        expect(info.imageSource).toBe('folder');
        expect(info.readme).toBeNull();

        expect(detectLicense('This work is licensed under a Creative Commons Attribution 4.0 (CC BY) license')).toBe('CC BY 4.0');
        expect(detectLicense('released to the public domain')).toBe('CC0 (Public Domain)');
        expect(detectLicense('no license here')).toBeNull();
    });
});

describe('GeometryAccumulator', () => {
    it('returns null when nothing was added', () => {
        expect(new GeometryAccumulator().result()).toBeNull();
    });
});
