import type { V3 } from './AssetTypes';
import type { V6Hydrology as V5Hydrology } from '../domain/v6-hydrology';
import type { V5MeshWriter, V5SurfaceVertex } from './V5CoastMesh';
import { V5_COAST_STEP } from './V5CoastMesh';
export interface V5FillCell {
  readonly x: number;
  readonly z: number;
}
export const v5FillKey = (x: number, z: number): string => `${x},${z}`;
export function v5FillTop(x: number, z: number): V5SurfaceVertex {
  return { position: [x, 0.015, z], normal: [0, 1, 0], color: [0.53, 0.68, 0.31] };
}
/** Preserve quarter-grid and exact cliff intersection vertices along a filled cell edge. */
function edgePoints(
  field: V5Hydrology,
  a: readonly [number, number],
  b: readonly [number, number],
): Array<readonly [number, number]> {
  const coast = field.naturalCoast,
    aa = coast.toLocal(...a),
    bb = coast.toLocal(...b),
    da = aa[1] - coast.shore(aa[0]),
    db = bb[1] - coast.shore(bb[0]);
  if (Math.max(aa[0], bb[0]) < -8 || Math.min(aa[0], bb[0]) > 8 || da * db >= 0) return [a, b];
  let hit: readonly [number, number];
  if (aa[0] === bb[0]) hit = coast.toWorld(aa[0], coast.shore(aa[0]));
  else {
    const u0 = Math.floor(Math.min(aa[0], bb[0]) * 4) / 4,
      c0 = coast.shore(u0),
      slope = (coast.shore(u0 + 0.25) - c0) * 4;
    let u = u0 + (aa[1] - c0) / slope;
    if (Math.abs(u * 4 - Math.round(u * 4)) < 1e-10) u = Math.round(u * 4) / 4;
    hit = coast.toWorld(u, aa[1]);
  }
  return [a, hit, b];
}
/** Exposed faces only. Bottoms use the actual unfilled neighboring solid side, including cliffs. */
export function appendV5FillWalls(
  writer: V5MeshWriter,
  field: V5Hydrology,
  filled: ReadonlySet<string>,
  cell: V5FillCell,
): void {
  const { x, z } = cell;
  const sides = [
    { neighbor: [x - 1, z], a: [x, z], b: [x, z + 1] },
    { neighbor: [x, z + 1], a: [x, z + 1], b: [x + 1, z + 1] },
    { neighbor: [x + 1, z], a: [x + 1, z + 1], b: [x + 1, z] },
    { neighbor: [x, z - 1], a: [x + 1, z], b: [x, z] },
  ] as const;
  for (const side of sides) {
    if (filled.has(v5FillKey(...side.neighbor))) continue;
    const dx = side.b[0] - side.a[0],
      dz = side.b[1] - side.a[1],
      normal: V3 = [-dz, 0, dx];
    for (let t = 0; t < 1; t += V5_COAST_STEP) {
      const a: readonly [number, number] = [side.a[0] + dx * t, side.a[1] + dz * t],
        b: readonly [number, number] = [a[0] + dx * V5_COAST_STEP, a[1] + dz * V5_COAST_STEP];
      const points = edgePoints(field, a, b);
      for (let k = 0; k + 1 < points.length; k++) {
        const [ax, az] = points[k]!,
          [bx, bz] = points[k + 1]!;
        const local = field.naturalCoast.toLocal(
          (ax + bx) / 2 + normal[0] * 1e-7,
          (az + bz) / 2 + normal[2] * 1e-7,
        );
        const sideKind = local[1] > field.naturalCoast.shore(local[0]) ? 'water' : 'land';
        const at = field.sample(ax, az, sideKind).height,
          bt = field.sample(bx, bz, sideKind).height;
        const vertex = (xx: number, y: number, zz: number): V5SurfaceVertex => {
          const tone = Math.max(0, Math.min(1, (y + 1.1) / 1.115));
          return {
            position: [xx, y, zz],
            normal,
            color: [0.47 + 0.04 * tone, 0.34 + 0.05 * tone, 0.22 + 0.03 * tone],
          };
        };
        function levels(xx: number, zz: number, bottom: number): number[] {
          const p = field.naturalCoast.toLocal(xx, zz),
            ys = [0.015, bottom];
          if (Math.abs(p[0]) <= 8 && Math.abs(p[1] - field.naturalCoast.shore(p[0])) < 1e-9) {
            const top = field.base.sample(xx, zz).height,
              bed = field.naturalCoast.sampleWaterBedLocal(...p).height;
            for (let i = 0; i <= 8; i++) {
              const y = top * (1 - i / 8) + (bed * i) / 8;
              if (y < 0.015 - 1e-12 && y > bottom + 1e-12) ys.push(y);
            }
          }
          return [...new Set(ys)].sort((a, b) => b - a);
        }
        const ring = [
          ...levels(ax, az, at).map((y) => vertex(ax, y, az)),
          ...levels(bx, bz, bt)
            .reverse()
            .map((y) => vertex(bx, y, bz)),
        ];
        const center = vertex((ax + bx) / 2, (0.03 + at + bt) / 4, (az + bz) / 2);
        for (let i = 0; i < ring.length; i++)
          writer.triangle(center, ring[i]!, ring[(i + 1) % ring.length]!);
      }
    }
  }
}

/** Fill top keeps every real cliff-crossing boundary vertex used by its exposed walls. */
export function appendV5FillTile(
  writer: V5MeshWriter,
  field: V5Hydrology,
  x: number,
  z: number,
): void {
  const p: Array<readonly [number, number]> = [
      [x, z],
      [x, z + 0.25],
      [x + 0.25, z + 0.25],
      [x + 0.25, z],
    ],
    ring: Array<readonly [number, number]> = [];
  for (let i = 0; i < 4; i++) {
    const segment = edgePoints(field, p[i]!, p[(i + 1) % 4]!);
    ring.push(...segment.slice(0, -1));
  }
  const center = v5FillTop(x + 0.125, z + 0.125);
  for (let i = 0; i < ring.length; i++)
    writer.triangle(center, v5FillTop(...ring[i]!), v5FillTop(...ring[(i + 1) % ring.length]!));
}
