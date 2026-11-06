import type { V6SurfaceChunk, V6SurfaceTriangle, V6SurfaceMesh } from '../art/V6SurfaceContracts';
import type { SurfaceRay, SurfacePoint } from './NaturalPicking';
export interface V6TerrainHit extends V6SurfaceTriangle {
  distance: number;
  point: SurfacePoint;
}
function intersectsBounds(
  ray: SurfaceRay,
  surface: { min: readonly number[]; max: readonly number[] },
  limit: number,
): boolean {
  let near = 0,
    far = limit;
  for (const [axis, i] of [
    ['x', 0],
    ['y', 1],
    ['z', 2],
  ] as const) {
    const o = ray.o[axis],
      d = ray.d[axis],
      lo = surface.min[i]!,
      hi = surface.max[i]!;
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return false;
    } else {
      const a = (lo - o) / d,
        b = (hi - o) / d;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
    if (far < near) return false;
  }
  return true;
}
/** Match the rendered terrain material: back-facing triangles are culled. */
function triangleDistance(
  ray: SurfaceRay,
  p: readonly number[],
  a: number,
  b: number,
  c: number,
): number | null {
  const ax = p[a * 3]!,
    ay = p[a * 3 + 1]!,
    az = p[a * 3 + 2]!;
  const ux = p[b * 3]! - ax,
    uy = p[b * 3 + 1]! - ay,
    uz = p[b * 3 + 2]! - az;
  const vx = p[c * 3]! - ax,
    vy = p[c * 3 + 1]! - ay,
    vz = p[c * 3 + 2]! - az;
  const hx = ray.d.y * vz - ray.d.z * vy,
    hy = ray.d.z * vx - ray.d.x * vz,
    hz = ray.d.x * vy - ray.d.y * vx;
  const det = ux * hx + uy * hy + uz * hz;
  if (det <= 1e-12) return null;
  const sx = ray.o.x - ax,
    sy = ray.o.y - ay,
    sz = ray.o.z - az;
  const u = (sx * hx + sy * hy + sz * hz) / det;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  const qx = sy * uz - sz * uy,
    qy = sz * ux - sx * uz,
    qz = sx * uy - sy * ux;
  const v = (ray.d.x * qx + ray.d.y * qy + ray.d.z * qz) / det;
  if (v < -1e-9 || u + v > 1 + 1e-9) return null;
  const t = (vx * qx + vy * qy + vz * qz) / det;
  return t > 1e-9 ? t : null;
}
interface CellIndex {
  min: number[];
  max: number[];
  triangles: number[];
}
interface ChunkIndex {
  mesh: V6SurfaceMesh;
  cells: readonly CellIndex[];
}
const indexes = new WeakMap<V6SurfaceMesh, ChunkIndex>();
export function* prepareV6TerrainPickingSteps(
  mesh: V6SurfaceMesh,
  batch = 128,
): Generator<void, ChunkIndex> {
  const old = indexes.get(mesh);
  if (old) return old;
  const cells = new Map<string, CellIndex>();
  for (let t = 0; t < mesh.triangles.length; t++) {
    if (t && t % Math.max(1, Math.floor(batch)) === 0) yield;
    const meta = mesh.triangles[t]!,
      key = `${meta.x},${meta.z}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
        triangles: [],
      };
      cells.set(key, cell);
    }
    cell.triangles.push(t);
    for (let j = 0; j < 3; j++)
      for (let a = 0; a < 3; a++) {
        const value = mesh.positions[mesh.indices[t * 3 + j]! * 3 + a]!;
        cell.min[a] = Math.min(cell.min[a]!, value);
        cell.max[a] = Math.max(cell.max[a]!, value);
      }
  }
  const result = { mesh, cells: [...cells.values()] };
  indexes.set(mesh, result);
  return result;
}
function indexChunk(mesh: V6SurfaceMesh): ChunkIndex {
  const work = prepareV6TerrainPickingSteps(mesh);
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}
/** Prepare hidden CPU indexing before a transaction is eligible for publication. */
export function prepareV6TerrainPicking(mesh: V6SurfaceMesh): void {
  indexChunk(mesh);
}
/** Only committed Float32 triangles are pickable. Bounds reject, never fabricate hits. */
export class V6TerrainPicking {
  private chunks: readonly ChunkIndex[] = [];
  sync(chunks: Iterable<V6SurfaceChunk>): void {
    this.chunks = [...chunks].map((c) => indexChunk(c.mesh));
  }
  pick(ray: SurfaceRay): V6TerrainHit | null {
    let nearest: V6TerrainHit | null = null;
    for (const { mesh, cells } of this.chunks) {
      if (!intersectsBounds(ray, mesh, nearest?.distance ?? Infinity)) continue;
      for (const cell of cells) {
        if (!intersectsBounds(ray, cell, nearest?.distance ?? Infinity)) continue;
        for (const t of cell.triangles) {
          const i = t * 3,
            distance = triangleDistance(
              ray,
              mesh.positions,
              mesh.indices[i]!,
              mesh.indices[i + 1]!,
              mesh.indices[i + 2]!,
            );
          if (distance === null || distance >= (nearest?.distance ?? Infinity)) continue;
          const meta = mesh.triangles[t]!,
            point = {
              x: ray.o.x + ray.d.x * distance,
              y: ray.o.y + ray.d.y * distance,
              z: ray.o.z + ray.d.z * distance,
            };
          let { x, z } = meta;
          // Broad untouched coast fans span cells. Artificial fill wall ownership is
          // the inward solid side of its exact normal, not floor of a boundary hit.
          if (meta.surface === 'coast') {
            const v = mesh.indices[i]! * 3,
              wall = Math.abs(mesh.normals[v + 1]!) < 0.5;
            x = Math.floor(point.x - (wall ? mesh.normals[v]! * 1e-5 : 0));
            z = Math.floor(point.z - (wall ? mesh.normals[v + 2]! * 1e-5 : 0));
          }
          nearest = { ...meta, x, z, distance, point };
        }
      }
    }
    return nearest;
  }
}
