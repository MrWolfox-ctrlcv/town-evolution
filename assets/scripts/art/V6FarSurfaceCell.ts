import { v6WorldHeight, v6PreparedSamples } from './V6SurfaceSamples';
import type { V3 } from './AssetTypes';
import type { V6SurfaceSource } from './V6SurfaceContracts';
import { v6SurfaceNormal } from './V6SurfaceNormals';
export const V6_FAR_DEFAULT_HEIGHT_ERROR = 1 / 16;
export const V6_FAR_MAX_HEIGHT_ERROR = 1 / 4;
export const V6_FAR_MAX_NORMAL_ERROR = 0.06;
type Material = 'grass' | 'stone';
const normalOrder = [
  12, 2, 10, 14, 22, 0, 1, 3, 4, 5, 6, 7, 8, 9, 11, 13, 15, 16, 17, 18, 19, 20, 21, 23, 24,
] as const;
const offsets = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
] as const;
export { offsets as v6FarNeighborOffsets };
/** Immutable snapshots own bounded qualification arrays; old revisions are collectable. */
const cache = new WeakMap<V6SurfaceSource, { flags: Uint8Array; errors: Float64Array }>();
export function v6FarCellUntouched(source: V6SurfaceSource, x: number, z: number): boolean {
  if (source.editAt(x, z)) return false;
  const original = source.world.resourceAt(x, z),
    live = source.resourceAt(x, z),
    cap = source.capAt(x, z);
  if (!original) return !live && (cap === -Infinity || cap === Infinity);
  return (
    !!live &&
    live.id === original.id &&
    live.kind === original.kind &&
    live.amount === original.amount &&
    cap === Infinity
  );
}
export function v6FarCellCandidate(
  source: V6SurfaceSource,
  x: number,
  z: number,
  maxError = V6_FAR_DEFAULT_HEIGHT_ERROR,
): boolean {
  return v6FarCellMaterial(source, x, z, maxError) !== null;
}
/** The canonical quarter triangles and the two corner triangles share a diagonal.
 * Their affine difference reaches extrema at the 25 original quarter vertices.
 * A transition fan uses those samples and the original center. Its deviation from
 * the corner planes is bounded by the same error, so final error is at most 2E.
 * The identical convexity argument bounds the interpolated normal vector error. */
export function v6FarCellMaterial(
  source: V6SurfaceSource,
  x: number,
  z: number,
  maxError = V6_FAR_DEFAULT_HEIGHT_ERROR,
): Material | null {
  if (!Number.isFinite(maxError) || maxError < 0 || maxError > V6_FAR_MAX_HEIGHT_ERROR)
    throw Error('Invalid far height error');
  if (maxError === 0) return null;
  const world = source.world;
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(z) ||
    x < 0 ||
    z < 0 ||
    x >= world.size ||
    z >= world.size
  )
    return null;
  let entry = cache.get(source);
  if (!entry) {
    entry = { flags: new Uint8Array(world.size ** 2), errors: new Float64Array(world.size ** 2) };
    cache.set(source, entry);
  }
  const { flags, errors } = entry;
  const index = z * world.size + x,
    previous = flags[index];
  if (previous === 1 || (previous && errors[index]! > maxError / 2)) return null;
  if (previous === 2 || previous === 3) return previous === 2 ? 'grass' : 'stone';
  flags[index] = 1;
  const cell = world.at(x, z);
  if (!cell || cell.reserved || !v6FarCellUntouched(source, x, z)) return null;
  // An untouched high cell may still own a wall against an excavated neighbor.
  // Keep that entire cell exact, including its cap intersections and strata.
  for (const [dx, dz] of offsets) {
    const nx = x + dx,
      nz = z + dz,
      neighbor = world.at(nx, nz);
    if (neighbor && !neighbor.reserved && !v6FarCellUntouched(source, nx, nz)) return null;
  }
  const heights: number[] = [],
    exposed: boolean[] = [];
  const original = world.resourceAt(x, z),
    ground = !original;
  const stone = source.resourceAt(x, z)?.kind === 'stone';
  for (let j = 0; j <= 4; j++)
    for (let i = 0; i <= 4; i++) {
      const px = x + i / 4,
        pz = z + j / 4;
      const h = Math.fround(
        v6PreparedSamples(world)
          ? v6WorldHeight(world, px, pz, ground)
          : source.heightInCell(px, pz, x, z),
      );
      heights.push(h);
      exposed.push(stone && h > Math.fround(v6WorldHeight(world, px, pz, true)));
    }
  let material: Material = 'grass';
  if (stone) {
    let previous: boolean | undefined;
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        const k = j * 5 + i;
        const a = exposed[k]! || exposed[k + 5]! || exposed[k + 6]!;
        const b = exposed[k]! || exposed[k + 6]! || exposed[k + 1]!;
        if (a !== b || (previous !== undefined && previous !== a)) return null;
        previous = a;
      }
    material = previous ? 'stone' : 'grass';
  }
  const mix = (k: number, value: (n: number) => number) => {
    const u = (k % 5) / 4,
      v = Math.floor(k / 5) / 4;
    return v >= u
      ? value(0) * (1 - v) + value(20) * (v - u) + value(24) * u
      : value(0) * (1 - u) + value(24) * v + value(4) * (u - v);
  };
  let heightError = 0;
  for (let k = 0; k < 25; k++)
    heightError = Math.max(heightError, Math.abs(heights[k]! - mix(k, (n) => heights[n]!)));
  if (!Number.isFinite(heightError)) return null;
  errors[index] = heightError;
  // A later looser request may qualify; never cache a tight height rejection as final.
  flags[index] = material === 'stone' ? 5 : 4;
  if (heightError > maxError / 2) return null;
  const normals: V3[] = [];
  const normal = (k: number): V3 => {
    if (normals[k]) return normals[k]!;
    const n = v6SurfaceNormal(world, x + (k % 5) / 4, z + Math.floor(k / 5) / 4, ground);
    // Certify the actual Float32 upload, retaining original attributes on emit.
    return (normals[k] = [Math.fround(n[0]), Math.fround(n[1]), Math.fround(n[2])]);
  };
  flags[index] = 1;
  // Reject curved normals early, before sampling every normal on an ineligible cell.
  for (const k of normalOrder) {
    const n = normal(k),
      u = (k % 5) / 4,
      v = Math.floor(k / 5) / 4;
    const upper = v >= u,
      a = normal(0),
      b = normal(upper ? 20 : 24),
      c = normal(upper ? 24 : 4);
    const wa = 1 - (upper ? v : u),
      wb = upper ? v - u : v,
      wc = upper ? u : u - v;
    // Keep the same Float32 samples and left-to-right weighted additions as mix.
    const dx = n[0] - (a[0] * wa + b[0] * wb + c[0] * wc);
    const dy = n[1] - (a[1] * wa + b[1] * wb + c[1] * wc);
    const dz = n[2] - (a[2] * wa + b[2] * wb + c[2] * wc);
    const error = Math.hypot(dx, dy, dz);
    if (error > V6_FAR_MAX_NORMAL_ERROR / 2 || !Number.isFinite(error)) return null;
  }
  flags[index] = material === 'stone' ? 3 : 2;
  return material!;
}
