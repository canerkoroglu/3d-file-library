import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import JSZip from 'jszip';
import { parseModelPart, assembleThreeMf, loadThreeMfObject, type ParsedPart } from '../src/lib/threeMf';

const NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"';

/** A single-triangle mesh object. */
function objectPart(id: string): string {
    return `<?xml version="1.0"?>
<model unit="millimeter" ${NS}>
  <resources>
    <object id="${id}" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="10" y="0" z="0"/>
          <vertex x="0" y="10" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build/>
</model>`;
}

/** Root that references the mesh living in another part via p:path (production extension). */
function rootPart(transform?: string): string {
    return `<?xml version="1.0"?>
<model unit="millimeter" ${NS}>
  <resources>
    <object id="2" type="model">
      <components>
        <component objectid="1" p:path="/3D/Objects/object_1.model"/>
      </components>
    </object>
  </resources>
  <build>
    <item objectid="2"${transform ? ` transform="${transform}"` : ''}/>
  </build>
</model>`;
}

function meshesOf(object: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    object.traverse((child) => {
        if (child instanceof THREE.Mesh) meshes.push(child);
    });
    return meshes;
}

describe('parseModelPart', () => {
    it('reads a mesh object with vertices and triangles', () => {
        const part = parseModelPart(objectPart('1'));
        const obj = part.objects.get('1');
        expect(obj?.mesh?.vertices.length).toBe(9);
        expect(obj?.mesh?.indices).toEqual([0, 1, 2]);
    });

    it('reads components with their cross-part path, and build items', () => {
        const part = parseModelPart(rootPart());
        expect(part.objects.get('2')?.components).toEqual([{ objectId: '1', path: '/3D/Objects/object_1.model', transform: undefined }]);
        expect(part.build).toEqual([{ objectId: '2', path: undefined, transform: undefined }]);
    });

    it('does not confuse objectid with id', () => {
        const part = parseModelPart(rootPart());
        expect(part.objects.has('2')).toBe(true);
        // the component's objectid is 1, but no object with id 1 exists in this part
        expect(part.objects.has('1')).toBe(false);
    });
});

describe('assembleThreeMf', () => {
    it('resolves a component that lives in another model part', () => {
        const parts = new Map<string, ParsedPart>([
            ['3D/3dmodel.model', parseModelPart(rootPart())],
            ['3D/Objects/object_1.model', parseModelPart(objectPart('1'))],
        ]);
        const { object, meshCount } = assembleThreeMf(parts, '3D/3dmodel.model');
        expect(meshCount).toBe(1);
        const meshes = meshesOf(object);
        expect(meshes).toHaveLength(1);
        expect(meshes[0].geometry.getAttribute('position').count).toBe(3);
    });

    it('applies a build-item transform (matrix layout)', () => {
        const parts = new Map<string, ParsedPart>([
            // translate x by +100 (last row of the 4x3 row-major transform)
            ['3D/3dmodel.model', parseModelPart(rootPart('1 0 0 0 1 0 0 0 1 100 0 0'))],
            ['3D/Objects/object_1.model', parseModelPart(objectPart('1'))],
        ]);
        const { object } = assembleThreeMf(parts, '3D/3dmodel.model');
        const box = new THREE.Box3().setFromObject(object);
        // original x spans 0..10; after +100 it is 100..110
        expect(box.min.x).toBeCloseTo(100, 3);
        expect(box.max.x).toBeCloseTo(110, 3);
    });

    it('returns no meshes when a build item points at a missing object', () => {
        const parts = new Map<string, ParsedPart>([['3D/3dmodel.model', parseModelPart(rootPart())]]);
        const { meshCount } = assembleThreeMf(parts, '3D/3dmodel.model');
        expect(meshCount).toBe(0);
    });
});

describe('loadThreeMfObject (end to end, real zip)', () => {
    async function buildZip(files: Record<string, string>): Promise<ArrayBuffer> {
        const zip = new JSZip();
        for (const [name, content] of Object.entries(files)) zip.file(name, content);
        return zip.generateAsync({ type: 'arraybuffer' });
    }

    const rels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

    it('renders a Bambu-style production-extension file the stock loader cannot', async () => {
        const buffer = await buildZip({
            '_rels/.rels': rels,
            '3D/3dmodel.model': rootPart(),
            '3D/Objects/object_1.model': objectPart('1'),
        });
        const object = await loadThreeMfObject(buffer);
        expect(meshesOf(object)).toHaveLength(1);
    });

    it('throws when there is no renderable geometry', async () => {
        const buffer = await buildZip({ '_rels/.rels': rels, '3D/3dmodel.model': rootPart() });
        await expect(loadThreeMfObject(buffer)).rejects.toThrow(/no renderable geometry/i);
    });
});
