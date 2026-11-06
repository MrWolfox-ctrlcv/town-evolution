import { V5HeightRecipe } from './v5-height-recipe';
import type { V5Reference } from './v5-height-recipe';
import { createV5Starter } from './v5-starter';
import { getV5Hydrology, getV5BaseHydrology } from './v5-hydrology';
export type V5Biome = 'plain' | 'mountain' | 'hill' | 'forest';
export interface V5WorldCell {
  x: number;
  z: number;
  biome: V5Biome;
  surfaceHeight: number;
  elevation: number;
}
export const V5_BASE_GENERATOR_REVISION = 'v5-mouth-resource-coast-fade-starter-1';
export const V5_GENERATOR_REVISION = 'v5-natural-coast-starter-1';
export const V5_COAST_FADE = { start: 0.85, end: 6.85 } as const;
export function v5Hash(seed: number, x: number, z: number): number {
  let n = (seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
export function v5Noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    s = (t: number) => t * t * (3 - 2 * t),
    u = s(x - ix),
    v = s(z - iz);
  return (
    (v5Hash(seed, ix, iz) * (1 - u) + v5Hash(seed, ix + 1, iz) * u) * (1 - v) +
    (v5Hash(seed, ix, iz + 1) * (1 - u) + v5Hash(seed, ix + 1, iz + 1) * u) * v
  );
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const summits = [
  [66, 62, 28],
  [82, 72, 36],
  [99, 82, 42],
  [115, 91, 34],
  [134, 94, 26],
] as const;
const hills = [
  [42, 60, 10, 12, 7],
  [54, 113, 13, 10, 9],
  [91, 148, 15, 11, 8],
  [148, 54, 11, 12, 8],
] as const;
const forests = [
  [45, 86, 15, 20],
  [58, 145, 20, 14],
  [151, 120, 17, 21],
  [114, 39, 19, 13],
] as const;
/** Legacy lab recipe's raw terrain mask, not a gameplay coastline or permission test. */
function rawWater(seed: number, x: number, z: number): boolean {
  const shiftX = (v5Hash(seed, 2, 7) - 0.5) * 6,
    shiftZ = (v5Hash(seed, 7, 2) - 0.5) * 6;
  const baseLand = () => {
    if (x < 1 || z < 1 || x >= 191 || z >= 191) return false;
    if (((x - 6) / 5.4) ** 2 + ((z - 5.5) / 5) ** 2 <= 1) return true;
    if (((x - 20) / 16) ** 2 + ((z - 19) / 16) ** 2 <= 1) return true;
    const u = (x + z - 188) / Math.SQRT2,
      v = (z - x) / Math.SQRT2,
      angle = Math.atan2(v / 77, u / 116),
      phase = (seed % 6283) / 1000;
    return (
      Math.hypot(u / 116, v / 77) <=
      1 + 0.03 * Math.sin(angle * 3 + phase) + (v5Noise(x / 17, z / 17, seed) - 0.5) * 0.06
    );
  };
  if (!baseLand()) return true;
  if (
    [
      [184, 88, 27, 18],
      [76, 183, 21, 24],
    ].some(([cx, cz, rx, rz]) => ((x - cx!) / rx!) ** 2 + ((z - cz!) / rz!) ** 2 < 1)
  )
    return true;
  const lx = 119 + shiftX,
    lz = 126 + shiftZ;
  if (
    Math.hypot((x - lx) / 14.5, (z - lz) / 10.5) <
    1 + (v5Noise(x / 4, z / 4, seed + 5) - 0.5) * 0.1
  )
    return true;
  const river = [
    [lx + 8, lz + 3],
    [141, 139 + shiftZ],
    [146, 151],
    [165, 157],
    [177, 173],
    [192, 183],
  ];
  return river.slice(1).some((b, i) => {
    const a = river[i]!,
      dx = b[0]! - a[0]!,
      dz = b[1]! - a[1]!,
      t = clamp(((x - a[0]!) * dx + (z - a[1]!) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - a[0]! - t * dx, z - a[1]! - t * dz) < 2.9;
  });
}
function raw(
  seed: number,
  xCell: number,
  zCell: number,
): { biome: V5Biome; surfaceHeight: number; forestCore: number } {
  const flat = { biome: 'plain' as const, surfaceHeight: 0, forestCore: -Infinity },
    x = xCell + 0.5,
    z = zCell + 0.5;
  if (rawWater(seed, x, z) || (xCell < 36 && zCell < 36)) return flat;
  const sx = (v5Hash(seed, 2, 7) - 0.5) * 6,
    sz = (v5Hash(seed, 7, 2) - 0.5) * 6,
    wx = x + (v5Noise(x / 8, z / 8, seed + 41) - 0.5) * 4 - sx,
    wz = z + (v5Noise(x / 8, z / 8, seed + 227) - 0.5) * 4 - sz;
  let mountain = 0,
    hill = 0;
  for (const [cx, cz, peak] of summits) {
    const d = Math.hypot((wx - cx) / 10.5, (wz - cz) / 12);
    mountain = Math.max(mountain, peak * Math.max(0, 1 - d / 2.1) ** 1.25);
  }
  mountain *=
    1 +
    (v5Noise(x / 3.8, z / 3.8, seed + 997) - 0.5) * 0.11 +
    (v5Noise(x / 10, z / 10, seed + 1013) - 0.5) * 0.09;
  for (const [cx, cz, rx, rz, peak] of hills) {
    const angle = (v5Hash(seed, cx, cz) - 0.5) * 1.2,
      dx = wx - cx,
      dz = wz - cz,
      xx = Math.cos(angle) * dx - Math.sin(angle) * dz,
      zz = Math.sin(angle) * dx + Math.cos(angle) * dz,
      d = Math.hypot(xx / rx, zz / rz),
      shoulder = Math.hypot((xx - 7) / (rx * 0.78), (zz + 4) / (rz * 0.82)),
      a = peak * Math.max(0, 1 - (d / 1.8) ** 2) ** 2,
      b = peak * 0.64 * Math.max(0, 1 - (shoulder / 1.65) ** 2) ** 2;
    hill = Math.max(hill, Math.max(a, b));
  }
  hill *= 1 + (v5Noise(x / 5, z / 5, seed + 91) - 0.5) * 0.14;
  if (mountain > 0.65 && mountain >= hill)
    return { biome: 'mountain', surfaceHeight: mountain, forestCore: -Infinity };
  if (hill > 0.45) return { biome: 'hill', surfaceHeight: hill, forestCore: -Infinity };
  let forest = -Infinity;
  for (const [cx, cz, rx, rz] of forests)
    forest = Math.max(forest, 1 - Math.hypot((wx - cx) / (rx * 1.12), (wz - cz) / (rz * 1.12)));
  const core =
    forest +
    (v5Noise(x / 7, z / 7, seed + 83) - 0.5) * 0.65 +
    (v5Noise(x / 2.5, z / 2.5, seed + 97) - 0.5) * 0.16;
  return { biome: core > -0.04 ? 'forest' : 'plain', surfaceHeight: 0, forestCore: core };
}
export interface V5World {
  size: 192;
  seed: number;
  revision: typeof V5_GENERATOR_REVISION | typeof V5_BASE_GENERATOR_REVISION;
  reference: V5Reference;
  recipe: V5HeightRecipe;
  treeCandidates: readonly { x: number; z: number }[];
  hydrology: ReturnType<typeof getV5Hydrology> | ReturnType<typeof getV5BaseHydrology>;
  at(x: number, z: number): V5WorldCell | null;
}
const cache = new Map<number, V5World>();
const baseCache = new Map<number, V5World>();
export function getV5World(seed: number): V5World {
  return buildWorld(seed, false);
}
/** Frozen pre-feature oracle only. Never use to reinterpret or import saved v5 lists. */
export function getV5BaseWorld(seed: number): V5World {
  return buildWorld(seed, true);
}
function buildWorld(seed: number, baseOnly: boolean): V5World {
  const worldCache = baseOnly ? baseCache : cache;
  const old = worldCache.get(seed);
  if (old) return old;
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 1_000_000_000)
    throw Error('Invalid v5 seed');
  const hydro = baseOnly ? getV5BaseHydrology(seed) : getV5Hydrology(seed),
    starter = createV5Starter(seed, hydro),
    cells: Array<V5WorldCell | null> = new Array(192 * 192).fill(null),
    treeCandidates: Array<{ x: number; z: number }> = [];
  for (let z = 0; z < 192; z++)
    for (let x = 0; x < 192; x++) {
      if (hydro.at(x, z)?.state !== 'dryBuildable') continue;
      if (hydro.reserveCell(x, z)) {
        cells[z * 192 + x] = { x, z, biome: 'plain', surfaceHeight: 0, elevation: 0 };
        continue;
      }
      const base = raw(seed, x, z),
        starterCell = starter.at(x, z),
        c = starterCell ? { ...base, ...starterCell, forestCore: -Infinity } : base,
        dry = hydro.fields(x + 0.5, z + 0.5).dry,
        t = clamp((dry - 0.85) / 6, 0, 1),
        surfaceHeight = c.surfaceHeight * (t * t * (3 - 2 * t));
      cells[z * 192 + x] = { x, z, biome: c.biome, surfaceHeight, elevation: 0 };
      if (
        (x >= 36 || z >= 36) &&
        c.biome === 'forest' &&
        dry >= 1.8 &&
        v5Hash(seed + 881, x, z) <
          clamp(
            0.34 + c.forestCore * 0.5 + (v5Noise(x / 8, z / 8, seed + 251) - 0.5) * 0.24,
            0.22,
            0.72,
          ) &&
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].every(([dx, dz]) => !rawWater(seed, x + dx! + 0.5, z + dz! + 0.5))
      )
        treeCandidates.push({ x, z });
    }
  for (const p of starter.treeCandidates) {
    const c = cells[p.z * 192 + p.x];
    if (!hydro.reserveCell(p.x, p.z) && c?.biome === 'forest' && c.surfaceHeight === 0)
      treeCandidates.push({ ...p });
  }
  treeCandidates.sort((a, b) => a.z - b.z || a.x - b.x);
  const at = (x: number, z: number) =>
    Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < 192 && z < 192
      ? (cells[z * 192 + x] ?? null)
      : null;
  const reference: V5Reference = { size: 192, seed, at },
    recipe = new V5HeightRecipe(reference);
  for (const c of cells) if (c) c.elevation = recipe.initialStock(c.x, c.z);
  const result: V5World = {
    size: 192,
    seed,
    revision: baseOnly ? V5_BASE_GENERATOR_REVISION : V5_GENERATOR_REVISION,
    reference,
    recipe,
    treeCandidates,
    hydrology: hydro,
    at,
  };
  if (worldCache.size >= 2) {
    const first = worldCache.keys().next().value!;
    worldCache.get(first)!.recipe.clearSampleCache();
    worldCache.delete(first);
  }
  worldCache.set(seed, result);
  return result;
}
