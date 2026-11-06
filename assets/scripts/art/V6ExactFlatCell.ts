import { v6SurfaceNormal } from './V6SurfaceNormals';
import type { V6SurfaceSource, V6SurfacePoint } from './V6SurfaceContracts';
/** Exact constant attribute field, not distance LOD. Resource-bearing, edited and
 * boundary-normal cells retain every original triangle. No cross-cell merging. */
export function v6ExactFlatCell(
  source: V6SurfaceSource,
  x: number,
  z: number,
): V6SurfacePoint[] | null {
  if (source.editAt(x, z) || source.world.resourceAt(x, z) || source.resourceAt(x, z)) return null;
  const height = Math.fround(source.heightInCell(x, z, x, z));
  const normal = v6SurfaceNormal(source.world, x, z, true);
  for (let j = 0; j <= 4; j++)
    for (let i = 0; i <= 4; i++) {
      const px = x + i / 4,
        pz = z + j / 4;
      if (!Object.is(Math.fround(source.heightInCell(px, pz, x, z)), height)) return null;
      const n = v6SurfaceNormal(source.world, px, pz, true);
      if (n.some((v, a) => !Object.is(v, normal[a]))) return null;
    }
  return [
    [x, z],
    [x, z + 1],
    [x + 1, z + 1],
    [x + 1, z],
  ].map(([px, pz]) => ({
    x: px!,
    z: pz!,
    h: height,
    g: source.world.groundHeight(px!, pz!),
  }));
}
/** Match the quarter-grid perimeter of every unsimplified neighbor, including
 * unloaded/cross-chunk cells. Internal flat neighbors may share one full edge. */
export function v6ExactFlatTriangles(
  source: V6SurfaceSource,
  x: number,
  z: number,
): V6SurfacePoint[][] | null {
  const corners = cachedFlatCell(source, x, z);
  if (!corners) return null;
  const boundary: V6SurfacePoint[] = [];
  const offsets = [
    [-1, 0],
    [0, 1],
    [1, 0],
    [0, -1],
  ];
  for (let side = 0; side < 4; side++) {
    const [dx, dz] = offsets[side]!;
    const neighbor = source.world.at(x + dx!, z + dz!);
    const other = neighbor && !neighbor.reserved ? cachedFlatCell(source, x + dx!, z + dz!) : null;
    const segments = other && Object.is(other[0]!.h, corners[0]!.h) ? 1 : 4;
    const a = corners[side]!,
      b = corners[(side + 1) % 4]!;
    for (let i = 0; i < segments; i++) {
      const px = a.x + ((b.x - a.x) * i) / segments;
      const pz = a.z + ((b.z - a.z) * i) / segments;
      boundary.push({ x: px, z: pz, h: a.h, g: source.world.groundHeight(px, pz) });
    }
  }
  if (boundary.length === 4)
    return [
      [corners[0]!, corners[1]!, corners[2]!],
      [corners[0]!, corners[2]!, corners[3]!],
    ];
  const center = {
    x: x + 0.5,
    z: z + 0.5,
    h: corners[0]!.h,
    g: source.world.groundHeight(x + 0.5, z + 0.5),
  };
  return boundary.map((a, i) => [center, a, boundary[(i + 1) % boundary.length]!]);
}

const qualifications = new WeakMap<V6SurfaceSource, { methods: unknown[]; flags: Uint8Array }>();
function cachedFlatCell(source: V6SurfaceSource, x: number, z: number): V6SurfacePoint[] | null {
  const methods = [
    source.heightInCell,
    source.editAt,
    source.resourceAt,
    source.world.normal,
    source.world.resourceAt,
  ];
  let entry = qualifications.get(source);
  if (!entry || methods.some((method, i) => method !== entry!.methods[i])) {
    entry = { methods, flags: new Uint8Array(source.world.size ** 2) };
    qualifications.set(source, entry);
  }
  const index = z * source.world.size + x,
    flag = entry.flags[index];
  if (flag === 1) return null;
  if (flag === 2) {
    const h = Math.fround(source.heightInCell(x, z, x, z));
    return [
      [x, z],
      [x, z + 1],
      [x + 1, z + 1],
      [x + 1, z],
    ].map(([px, pz]) => ({
      x: px!,
      z: pz!,
      h,
      g: source.world.groundHeight(px!, pz!),
    }));
  }
  const result = v6ExactFlatCell(source, x, z);
  entry.flags[index] = result ? 2 : 1;
  return result;
}
