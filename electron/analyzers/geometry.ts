import type { GeometryStats } from './types';

/** Incrementally accumulates bounding box and signed volume from triangles. */
export class GeometryAccumulator {
    private minX = Infinity;
    private minY = Infinity;
    private minZ = Infinity;
    private maxX = -Infinity;
    private maxY = -Infinity;
    private maxZ = -Infinity;
    private volume = 0;
    private triangles = 0;
    private vertices = 0;

    addVertex(x: number, y: number, z: number): void {
        if (x < this.minX) this.minX = x;
        if (y < this.minY) this.minY = y;
        if (z < this.minZ) this.minZ = z;
        if (x > this.maxX) this.maxX = x;
        if (y > this.maxY) this.maxY = y;
        if (z > this.maxZ) this.maxZ = z;
        this.vertices++;
    }

    addTriangle(
        ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number,
    ): void {
        this.addVertex(ax, ay, az);
        this.addVertex(bx, by, bz);
        this.addVertex(cx, cy, cz);
        // Signed volume of the tetrahedron formed with the origin.
        this.volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
        this.triangles++;
    }

    /** Count a triangle without contributing to volume (used when only indices are known). */
    countTriangle(): void {
        this.triangles++;
    }

    get triangleCount(): number {
        return this.triangles;
    }

    result(includeVolume = true): GeometryStats | null {
        if (this.vertices === 0) return null;
        const round = (n: number) => Math.round(n * 1000) / 1000;
        return {
            triangleCount: this.triangles,
            bbox: {
                x: round(this.maxX - this.minX),
                y: round(this.maxY - this.minY),
                z: round(this.maxZ - this.minZ),
            },
            volume: includeVolume && this.triangles > 0 ? round(Math.abs(this.volume)) : null,
        };
    }
}
