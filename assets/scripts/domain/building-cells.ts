import type { Building, LandCell } from './types';
import { CONFIG } from './config';
/** Main body only: crop coordinates and model origins must not shift when a box is attached. */
export function footprint(b: Pick<Building, 'kind' | 'rotation' | 'farmSize' | 'bridge'>): {
  width: number;
  depth: number;
} {
  if (b.kind === 'woodenBridge' && b.bridge)
    return b.rotation % 2
      ? { width: b.bridge.length, depth: 2 }
      : { width: 2, depth: b.bridge.length };
  if (b.kind === 'farm' && b.farmSize === 6) return { width: 4, depth: 4 };
  const d = CONFIG.buildings[b.kind];
  return b.rotation % 2 ? { width: d.depth, depth: d.width } : { width: d.width, depth: d.depth };
}
/** One real outside tile rotates around the unchanged field body, preserving every crop cell. */
export function farmBoxCell(b: Building): LandCell | null {
  if (b.kind !== 'farm' || !b.collectionBox) return null;
  const n = b.farmSize === 6 ? 4 : 2;
  return [
    { x: b.x + n, z: b.z + n - 1 },
    { x: b.x + n - 1, z: b.z - 1 },
    { x: b.x - 1, z: b.z },
    { x: b.x, z: b.z + n },
  ][b.rotation]!;
}
export function buildingOccupiedCells(b: Building): LandCell[] {
  const d = footprint(b),
    cells: LandCell[] = [];
  for (let dz = 0; dz < d.depth; dz++)
    for (let dx = 0; dx < d.width; dx++) cells.push({ x: b.x + dx, z: b.z + dz });
  const box = farmBoxCell(b);
  if (box) cells.push(box);
  return cells;
}
export function buildingOccupiesCell(b: Building, x: number, z: number): boolean {
  const d = footprint(b),
    box = farmBoxCell(b);
  return (
    (x >= b.x && x < b.x + d.width && z >= b.z && z < b.z + d.depth) ||
    Boolean(box && x === box.x && z === box.z)
  );
}
