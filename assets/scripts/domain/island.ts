import type { Building, GameState } from './types';
import { CONFIG, MAX_VALUE } from './config';
export const DEFAULT_MAP_SEED = 1;
/** A deterministic rounded island with seed-dependent coves and a safe starter-town lobe. */
export function isLandCell(x: number, z: number, seed = DEFAULT_MAP_SEED): boolean {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(z) ||
    x < 1 ||
    z < 1 ||
    x >= CONFIG.gridSize - 1 ||
    z >= CONFIG.gridSize - 1
  )
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
export const isLand = isLandCell;
export function landCellCount(seed = DEFAULT_MAP_SEED): number {
  let count = 0;
  for (let z = 0; z < CONFIG.gridSize; z++)
    for (let x = 0; x < CONFIG.gridSize; x++) if (isLandCell(x, z, seed)) count++;
  return count;
}
export function isDockShore(
  b: Pick<Building, 'x' | 'z' | 'rotation' | 'kind'>,
  seed = DEFAULT_MAP_SEED,
): boolean {
  const d = CONFIG.buildings[b.kind],
    width = b.rotation % 2 ? d.depth : d.width,
    depth = b.rotation % 2 ? d.width : d.depth;
  for (let dx = 0; dx < width; dx++)
    for (let dz = 0; dz < depth; dz++) if (!isLandCell(b.x + dx, b.z + dz, seed)) return false;
  if (b.rotation % 2 === 0) {
    const waterZ = b.rotation === 0 ? b.z + depth : b.z - 1;
    for (let dx = 0; dx < width; dx++) if (isLandCell(b.x + dx, waterZ, seed)) return false;
  } else {
    const waterX = b.rotation === 1 ? b.x + width : b.x - 1;
    for (let dz = 0; dz < depth; dz++) if (isLandCell(waterX, b.z + dz, seed)) return false;
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
export function populateIslandTrees(s: GameState, count = 24): void {
  const occupied = (x: number, z: number) =>
    s.trees.some((t) => t.x === x && t.z === z) ||
    s.groundStacks.some((p) => p.x === x && p.z === z) ||
    s.buildings.some((b) => {
      const d = CONFIG.buildings[b.kind],
        w = b.rotation % 2 ? d.depth : d.width,
        h = b.rotation % 2 ? d.width : d.depth;
      return x >= b.x - 1 && x < b.x + w + 1 && z >= b.z - 1 && z < b.z + h + 1;
    });
  const candidates: { x: number; z: number; score: number }[] = [];
  for (let z = 1; z < CONFIG.gridSize - 1; z++)
    for (let x = 1; x < CONFIG.gridSize - 1; x++)
      if (
        isLandCell(x, z, s.mapSeed) &&
        !occupied(x, z) &&
        !isDockShore({ kind: 'dock', x, z, rotation: 0 }, s.mapSeed)
      )
        candidates.push({ x, z, score: score(s.mapSeed, x, z) });
  candidates.sort((a, b) => a.score - b.score || a.z - b.z || a.x - b.x);
  for (const tile of candidates) {
    if (count <= 0 || s.nextTreeId >= MAX_VALUE) break;
    if (s.trees.some((t) => Math.abs(t.x - tile.x) + Math.abs(t.z - tile.z) < 2)) continue;
    s.trees.push({ id: `t${s.nextTreeId++}`, x: tile.x, z: tile.z });
    count--;
  }
}
