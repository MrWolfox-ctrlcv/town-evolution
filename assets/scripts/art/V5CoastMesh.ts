import type { MeshData, V3 } from './AssetTypes';
import { emptyNaturalMesh } from './NaturalMesh';
import { coastVertex } from './CoastMesh';
export interface V5SurfaceVertex {
  position: V3;
  normal: V3;
  color: V3;
}
export const V5_COAST_STEP = 0.25;
/** Shared global-lattice normals: adjacent chunks never use a one-sided boundary stencil. */
export function v5SurfaceSampler(field: {
  sample(x: number, z: number): { height: number; color: V3 };
}) {
  const cache = new Map<string, V5SurfaceVertex>();
  return (x: number, z: number): V5SurfaceVertex => {
    const key = `${x},${z}`,
      old = cache.get(key);
    if (old) return old;
    const s = field.sample(x, z),
      h = V5_COAST_STEP;
    const p = (dx: number, dz: number): V3 => [dx, field.sample(x + dx, z + dz).height, dz];
    const a = p(-h, -h),
      b = p(-h, 0),
      c = p(0, 0),
      d = p(0, -h);
    const e = p(h, 0),
      f = p(h, h),
      g = p(0, h);
    const normal = [0, 0, 0];
    for (const [v0, v1, v2] of [
      [a, b, c],
      [a, c, d],
      [d, c, e],
      [b, g, c],
      [c, g, f],
      [c, f, e],
    ] as const) {
      const u = v1.map((v, i) => v - v0[i]!),
        v = v2.map((v, i) => v - v0[i]!);
      normal[0]! += u[1]! * v[2]! - u[2]! * v[1]!;
      normal[1]! += u[2]! * v[0]! - u[0]! * v[2]!;
      normal[2]! += u[0]! * v[1]! - u[1]! * v[0]!;
    }
    const length = Math.hypot(...normal);
    const value: V5SurfaceVertex = {
      position: [x, s.height, z],
      normal: normal.map((v) => v / length) as unknown as V3,
      color: s.color,
    };
    if (cache.size >= 8192) cache.delete(cache.keys().next().value!);
    cache.set(key, value);
    return value;
  };
}
export function v5MeshWriter() {
  const mesh = emptyNaturalMesh(),
    vertices = new Map<string, number>();
  function vertex(p: V5SurfaceVertex): number {
    const key = JSON.stringify([p.position, p.normal, p.color]),
      old = vertices.get(key);
    if (old !== undefined) return old;
    const index = coastVertex(mesh, ...p.position, ...p.normal, p.color);
    vertices.set(key, index);
    return index;
  }
  function triangle(a: V5SurfaceVertex, b: V5SurfaceVertex, c: V5SurfaceVertex): void {
    const u = b.position.map((v, i) => v - a.position[i]!);
    const v = c.position.map((value, i) => value - a.position[i]!);
    const normal = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    if (Math.hypot(...normal) < 1e-12) return;
    mesh.indices.push(vertex(a), vertex(b), vertex(c));
  }
  function finish(): MeshData {
    if (mesh.positions.length / 3 > 65535) throw new Error('V5 coast chunk exceeds Uint16');
    if (!mesh.positions.length) {
      mesh.min = [0, 0, 0];
      mesh.max = [0, 0, 0];
    }
    return mesh;
  }
  return { triangle, finish };
}
export type V5MeshWriter = ReturnType<typeof v5MeshWriter>;
