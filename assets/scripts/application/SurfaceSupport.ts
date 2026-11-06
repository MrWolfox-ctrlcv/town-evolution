type Vertex = { x: number; y: number; z: number };
export interface SupportRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
/** Exact upper support of rendered upward triangles, indexed in horizontal unit cells. */
export class SurfaceSupport {
  private readonly cells = new Map<string, number[]>();
  constructor(
    private readonly positions: readonly number[],
    private readonly indices: readonly number[],
    private readonly cellSize = 1,
  ) {
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [this.vertex(i), this.vertex(i + 1), this.vertex(i + 2)];
      if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) <= 1e-10) continue;
      for (
        let z = Math.floor(Math.min(a.z, b.z, c.z) / cellSize);
        z <= Math.floor(Math.max(a.z, b.z, c.z) / cellSize);
        z++
      )
        for (
          let x = Math.floor(Math.min(a.x, b.x, c.x) / cellSize);
          x <= Math.floor(Math.max(a.x, b.x, c.x) / cellSize);
          x++
        ) {
          const key = `${x},${z}`;
          const entries = this.cells.get(key) ?? [];
          entries.push(i);
          this.cells.set(key, entries);
        }
    }
  }
  private vertex(offset: number): Vertex {
    const i = this.indices[offset]! * 3;
    return { x: this.positions[i]!, y: this.positions[i + 1]!, z: this.positions[i + 2]! };
  }
  height(rect: SupportRect): number | null {
    if (
      !Object.values(rect).every(Number.isFinite) ||
      rect.minX > rect.maxX ||
      rect.minZ > rect.maxZ
    )
      return null;
    const candidates = new Set<number>();
    for (
      let z = Math.floor(rect.minZ / this.cellSize);
      z <= Math.floor(rect.maxZ / this.cellSize);
      z++
    )
      for (
        let x = Math.floor(rect.minX / this.cellSize);
        x <= Math.floor(rect.maxX / this.cellSize);
        x++
      )
        for (const index of this.cells.get(`${x},${z}`) ?? []) candidates.add(index);
    let highest = -Infinity;
    for (const i of candidates) {
      let polygon = [this.vertex(i), this.vertex(i + 1), this.vertex(i + 2)];
      for (const [axis, boundary, sign] of [
        ['x', rect.minX, 1],
        ['x', rect.maxX, -1],
        ['z', rect.minZ, 1],
        ['z', rect.maxZ, -1],
      ] as const) {
        const clipped: Vertex[] = [];
        for (let j = 0; j < polygon.length; j++) {
          const a = polygon[j]!,
            b = polygon[(j + 1) % polygon.length]!;
          const da = (a[axis] - boundary) * sign,
            db = (b[axis] - boundary) * sign;
          if (da >= 0) clipped.push(a);
          if (da >= 0 !== db >= 0) {
            const t = da / (da - db);
            const intersection = {
              x: a.x + (b.x - a.x) * t,
              y: a.y + (b.y - a.y) * t,
              z: a.z + (b.z - a.z) * t,
            };
            intersection[axis] = boundary;
            clipped.push(intersection);
          }
        }
        polygon = clipped;
        if (!polygon.length) break;
      }
      for (const vertex of polygon) highest = Math.max(highest, vertex.y);
    }
    return Number.isFinite(highest) ? highest : null;
  }
}
