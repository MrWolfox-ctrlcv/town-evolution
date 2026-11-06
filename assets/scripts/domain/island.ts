import { worldSize } from './world';
import type { TerrainVersion } from './world';
import type { Building, GameState, LandCell } from './types';
import { CONFIG, MAX_VALUE } from './config';
import { fractalNoise } from './noise';
import { biomeAt } from './biomes';
import { getV5Hydrology } from './v5-hydrology';
import { getV5World } from './v5-world';
import { isV5DockShore } from './v5-marine';
export const DEFAULT_MAP_SEED = 1;
/** Historical v8 land remains legal after expansion, including every saved building footprint. */
export function legacyLandCell(x: number, z: number, seed = DEFAULT_MAP_SEED): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(z) || x < 1 || z < 1 || x >= 23 || z >= 23)
    return false;
  const phase = (seed % 6283) / 1000;
  const dx = x + 0.5 - (11.7 + 0.55 * Math.sin(phase)),
    dz = z + 0.5 - (11.8 + 0.55 * Math.cos(phase));
  const angle = Math.atan2(dz, dx);
  const radius =
    8.8 +
    1.35 * Math.sin(3 * angle + phase) +
    0.85 * Math.sin(5 * angle - phase * 1.3) +
    0.35 * Math.cos(9 * angle + phase);
  const starterLobe = ((x + 0.5 - 6) / 4.8) ** 2 + ((z + 0.5 - 5.5) / 4.4) ** 2 <= 1;
  return starterLobe || Math.hypot(dx, dz) <= radius;
}
/** A larger seed-warped island, unioned with the former coastline for save compatibility. */
export function isLandCell(
  x: number,
  z: number,
  seed = DEFAULT_MAP_SEED,
  version: TerrainVersion = 4,
  extensions: readonly LandCell[] = [],
): boolean {
  if (
    extensions.some((p) => p.x === x && p.z === z) &&
    Number.isInteger(x) &&
    Number.isInteger(z) &&
    x >= 1 &&
    z >= 1 &&
    x < worldSize(version) - 1 &&
    z < worldSize(version) - 1
  )
    return true;
  if (version === 5)
    return (
      getV5Hydrology(seed).at(x, z)?.state === 'dryBuildable' &&
      x >= 1 &&
      z >= 1 &&
      x < worldSize(version) - 1 &&
      z < worldSize(version) - 1
    );
  if (version === 1) return legacyLandCell(x, z, seed);
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(z) ||
    x < 1 ||
    z < 1 ||
    x >= worldSize(version) - 1 ||
    z >= worldSize(version) - 1
  )
    return false;
  if (legacyLandCell(x, z, seed)) return true;
  if (version === 4) {
    // One connected island: a broad diagonal mainland joins the historical starter coast.
    if (isLandCell(x, z, seed, 3)) return true;
    const dx = x + 0.5 - 94,
      dz = z + 0.5 - 94;
    const u = (dx + dz) / Math.SQRT2,
      v = (dz - dx) / Math.SQRT2;
    const angle = Math.atan2(v / 77, u / 116);
    const phase = (seed % 6283) / 1000;
    const coast =
      1 +
      0.035 * Math.sin(angle * 3 + phase) +
      0.025 * Math.cos(angle * 5 - phase) +
      (fractalNoise(x / 17, z / 17, seed) - 0.5) * 0.1;
    return Math.hypot(u / 116, v / 77) <= coast;
  }
  const phase = (seed % 6283) / 1000;
  const dx = (x + 0.5 - 20) / 16,
    dz = (z + 0.5 - 19) / 16;
  const angle = Math.atan2(dz, dx);
  const coast =
    1 +
    Math.sin(angle * 3 + phase) * 0.065 +
    Math.cos(angle * 5 - phase) * 0.045 +
    (fractalNoise(x / 7, z / 7, seed) - 0.5) * 0.22;
  return Math.hypot(dx, dz) <= coast;
}
export const isLand = isLandCell;
const landCounts = new Map<string, number>();
export function landCellCount(
  seed = DEFAULT_MAP_SEED,
  version: TerrainVersion = 4,
  extensions: readonly LandCell[] = [],
): number {
  const key = `${seed}:${version}`;
  let count = landCounts.get(key);
  if (count === undefined) {
    count = 0;
    for (let z = 0; z < worldSize(version); z++)
      for (let x = 0; x < worldSize(version); x++) if (isLandCell(x, z, seed, version)) count++;
    if (landCounts.size >= 32) landCounts.delete(landCounts.keys().next().value!);
    landCounts.set(key, count);
  }
  const extra = new Set(
    extensions
      .filter(
        (p) =>
          Number.isInteger(p.x) &&
          Number.isInteger(p.z) &&
          p.x >= 1 &&
          p.z >= 1 &&
          p.x < worldSize(version) - 1 &&
          p.z < worldSize(version) - 1 &&
          !isLandCell(p.x, p.z, seed, version),
      )
      .map((p) => `${p.x},${p.z}`),
  );
  return count + extra.size;
}
export function isDockShore(
  b: Pick<Building, 'x' | 'z' | 'rotation' | 'kind'>,
  seed = DEFAULT_MAP_SEED,
  version: TerrainVersion = 4,
  extensions: readonly LandCell[] = [],
): boolean {
  if (version === 5) return b.kind === 'dock' && isV5DockShore(seed, b, extensions);
  const d = CONFIG.buildings[b.kind],
    width = b.rotation % 2 ? d.depth : d.width,
    depth = b.rotation % 2 ? d.width : d.depth;
  for (let dx = 0; dx < width; dx++)
    for (let dz = 0; dz < depth; dz++)
      if (!isLandCell(b.x + dx, b.z + dz, seed, version, extensions)) return false;
  if (b.rotation % 2 === 0) {
    const waterZ = b.rotation === 0 ? b.z + depth : b.z - 1;
    for (let dx = 0; dx < width; dx++)
      if (isLandCell(b.x + dx, waterZ, seed, version, extensions)) return false;
  } else {
    const waterX = b.rotation === 1 ? b.x + width : b.x - 1;
    for (let dz = 0; dz < depth; dz++)
      if (isLandCell(waterX, b.z + dz, seed, version, extensions)) return false;
  }
  return true;
}
export function mapSeedFromTime(time: number): number {
  return Math.floor(time % (MAX_VALUE - 1)) + 1;
}
function score(seed: number, x: number, z: number): number {
  let n = (seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
  return (n ^ (n >>> 13)) >>> 0;
}
/** New-town initialization only. Saving/loading never creates resources. */
export function populateIslandTrees(
  s: GameState,
  count = s.terrainVersion === 5
    ? MAX_VALUE
    : s.terrainVersion === 1
      ? 24
      : s.terrainVersion === 4
        ? 192
        : 64,
): void {
  const occupiedCells = new Set(
    [...s.trees, ...s.groundStacks, ...s.naturalResources].map((p) => `${p.x},${p.z}`),
  );
  for (const b of s.buildings) {
    const d = CONFIG.buildings[b.kind],
      w = b.kind === 'farm' && b.farmSize === 6 ? 4 : b.rotation % 2 ? d.depth : d.width,
      h = b.kind === 'farm' && b.farmSize === 6 ? 4 : b.rotation % 2 ? d.width : d.depth;
    for (let x = b.x - 1; x < b.x + w + 1; x++)
      for (let z = b.z - 1; z < b.z + h + 1; z++) occupiedCells.add(`${x},${z}`);
  }
  const occupied = (x: number, z: number) => occupiedCells.has(`${x},${z}`);
  if (s.terrainVersion === 5) {
    for (const tile of getV5World(s.mapSeed).treeCandidates) {
      if (count <= 0 || s.nextTreeId >= MAX_VALUE) break;
      if (occupied(tile.x, tile.z)) continue;
      s.trees.push({ id: `t${s.nextTreeId++}`, x: tile.x, z: tile.z });
      occupiedCells.add(`${tile.x},${tile.z}`);
      count--;
    }
    return;
  }
  const candidates: { x: number; z: number; score: number }[] = [];
  for (let z = 1; z < worldSize(s.terrainVersion) - 1; z++)
    for (let x = 1; x < worldSize(s.terrainVersion) - 1; x++)
      if (
        isLandCell(x, z, s.mapSeed, s.terrainVersion) &&
        !occupied(x, z) &&
        !isDockShore({ kind: 'dock', x, z, rotation: 0 }, s.mapSeed, s.terrainVersion)
      )
        candidates.push({
          x,
          z,
          score:
            score(s.mapSeed, x, z) +
            (s.terrainVersion === 1 || biomeAt(x, z, s.mapSeed, s.terrainVersion).biome === 'forest'
              ? 0
              : 4294967296),
        });
  candidates.sort((a, b) => a.score - b.score || a.z - b.z || a.x - b.x);
  // Keep accessible woodland near the unchanged starter town as well as on the mainland.
  const ordered =
    s.terrainVersion === 4
      ? [...candidates.filter((p) => p.x < 40 && p.z < 40).slice(0, 48), ...candidates]
      : candidates;
  for (const tile of ordered) {
    if (count <= 0 || s.nextTreeId >= MAX_VALUE) break;
    if (s.trees.some((t) => Math.abs(t.x - tile.x) + Math.abs(t.z - tile.z) < 2)) continue;
    s.trees.push({ id: `t${s.nextTreeId++}`, x: tile.x, z: tile.z });
    count--;
  }
}
