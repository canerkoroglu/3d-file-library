import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { deserializeObject, serializeObject } from '../src/lib/meshTransfer';

vi.mock('electron', () => ({ net: {}, protocol: {} }));
const { parseModelUrl } = await import('../electron/modelProtocol');

function triangle(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setIndex([0, 1, 2]);
    return geometry;
}

describe('mesh transfer', () => {
    it('round-trips a transformed tree and lists every buffer for transfer', () => {
        const group = new THREE.Group();
        group.position.set(1, 2, 3);
        const mesh = new THREE.Mesh(triangle(), new THREE.MeshStandardMaterial({ color: '#ff0000' }));
        mesh.rotation.z = Math.PI / 2;
        mesh.name = 'part';
        group.add(mesh);

        const { node, transfer } = serializeObject(group, true);
        // position + index (no normals were computed)
        expect(transfer).toHaveLength(2);
        expect(node.children[0].mesh?.color).toEqual([1, 0, 0]);

        const rebuilt = deserializeObject(node, () => new THREE.MeshBasicMaterial());
        expect(rebuilt.position.toArray()).toEqual([1, 2, 3]);
        const child = rebuilt.children[0] as THREE.Mesh;
        expect(child.name).toBe('part');
        expect(child.rotation.z).toBeCloseTo(Math.PI / 2);
        expect(Array.from(child.geometry.getIndex()!.array)).toEqual([0, 1, 2]);
        // Normals are computed when the file had none.
        expect(child.geometry.getAttribute('normal')).toBeDefined();
        expect((child.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ff0000');
    });

    it('uses the page material when colours are not kept', () => {
        const { node } = serializeObject(new THREE.Mesh(triangle(), new THREE.MeshStandardMaterial({ color: '#00ff00' })), false);
        const marker = new THREE.MeshBasicMaterial();
        const rebuilt = deserializeObject(node, () => marker) as THREE.Mesh;
        expect(rebuilt.material).toBe(marker);
    });
});

describe('model:// URLs', () => {
    it('accepts only model://library/<positive id>', () => {
        expect(parseModelUrl('model://library/42')).toBe(42);
        expect(parseModelUrl('model://library/0')).toBeNull();
        expect(parseModelUrl('model://library/../etc/passwd')).toBeNull();
        expect(parseModelUrl('model://library/1/2')).toBeNull();
        expect(parseModelUrl('model://other/1')).toBeNull();
        expect(parseModelUrl('media://library/1')).toBeNull();
        expect(parseModelUrl('not a url')).toBeNull();
    });
});
