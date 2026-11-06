import type { NaturalSurfaceData, NaturalResourceSurface } from '../art/NaturalSurfaceData';
export type SurfacePoint = { x: number; y: number; z: number };
export type SurfaceRay = { o: SurfacePoint; d: SurfacePoint };
export interface NaturalHit {
  id: string;
  distance: number;
  point: SurfacePoint;
}
/** Actual mesh bounds only reject candidates; never turn a logical column into a hit. */
function intersectsBounds(
  ray: SurfaceRay,
  surface: NaturalResourceSurface,
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
      lo = surface.min[i],
      hi = surface.max[i];
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
/** Owns no geometry: rendering and picking share the exact same immutable snapshot. */
export class NaturalPicking {
  private surface: NaturalSurfaceData = { positions: [], resources: [] };
  private live = new Set<string>();
  sync(surface: NaturalSurfaceData, resources: readonly { id: string; amount: number }[]): void {
    this.surface = surface;
    this.live = new Set(resources.filter((r) => r.amount > 0).map((r) => r.id));
  }
  private parts(): readonly NaturalSurfaceData[] {
    return this.surface.chunks ?? [this.surface];
  }
  private find(id: string) {
    for (const part of this.parts()) {
      const resource = part.resources.find((r) => r.id === id);
      if (resource) return resource;
    }
    return undefined;
  }
  origin(id: string): SurfacePoint | null {
    const resource = this.live.has(id) ? this.find(id) : undefined;
    return resource
      ? { x: resource.center[0], y: resource.center[1], z: resource.center[2] }
      : null;
  }
  bounds(id: string) {
    const resource = this.live.has(id) ? this.find(id) : undefined;
    return resource ? { min: resource.min, max: resource.max } : null;
  }
  /** Share geometry and retain only the visible-area candidates for a bounded multi-ray query. */
  subset(accept: (bounds: NaturalResourceSurface) => boolean): NaturalPicking {
    const picker = new NaturalPicking();
    const parts = this.parts().map((part) => ({
      positions: part.positions,
      resources: part.resources
        .filter((resource) => this.live.has(resource.id) && accept(resource))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }));
    picker.surface = this.surface.chunks
      ? { positions: [], resources: [], chunks: parts }
      : parts[0]!;
    picker.live = this.live;
    return picker;
  }
  pick(ray: SurfaceRay): NaturalHit | null {
    let nearest: NaturalHit | null = null;
    for (const part of this.parts())
      for (const resource of part.resources) {
        if (
          !this.live.has(resource.id) ||
          !intersectsBounds(ray, resource, nearest?.distance ?? Infinity)
        )
          continue;
        for (let i = 0; i < resource.indices.length; i += 3) {
          const distance = triangleDistance(
            ray,
            part.positions,
            resource.indices[i]!,
            resource.indices[i + 1]!,
            resource.indices[i + 2]!,
          );
          if (
            distance !== null &&
            (!nearest ||
              distance < nearest.distance ||
              (distance === nearest.distance && resource.id < nearest.id))
          )
            nearest = {
              id: resource.id,
              distance,
              point: {
                x: ray.o.x + ray.d.x * distance,
                y: ray.o.y + ray.d.y * distance,
                z: ray.o.z + ray.d.z * distance,
              },
            };
        }
      }
    return nearest;
  }
}
