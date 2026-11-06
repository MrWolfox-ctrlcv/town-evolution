import { validateV6Extensions } from './v6-maritime';
import type { TerrainVersion } from './world';
import type { Building, LandCell } from './types';
import { CONFIG } from './config';
import { worldSize } from './world';
import { integer, requireRule } from './guards';
import { isLandCell } from './island';
import { validateV5Extensions } from './v5-marine';

/** Reclaimed land is additive. Seeded terrain and existing natural resources never change. */
export function importLandExtensions(
  raw: unknown,
  seed: number,
  version: TerrainVersion,
): LandCell[] {
  if (raw === undefined) return [];
  requireRule(Array.isArray(raw) && raw.length <= worldSize(version) ** 2, '扩地记录无效');
  const cells: LandCell[] = [];
  const keys = new Set<string>();
  for (const value of raw) {
    requireRule(value && typeof value === 'object' && !Array.isArray(value), '扩地位置无效');
    const p = value as Record<string, unknown>;
    requireRule(
      integer(p.x, worldSize(version) - 2) &&
        p.x >= 1 &&
        integer(p.z, worldSize(version) - 2) &&
        p.z >= 1,
      '扩地位置超出地图',
    );
    const key = `${p.x},${p.z}`;
    requireRule(!keys.has(key) && !isLandCell(p.x, p.z, seed, version), '扩地记录重叠');
    keys.add(key);
    cells.push({ x: p.x, z: p.z });
  }
  if (version === 5 || version === 6) {
    if (version === 6) validateV6Extensions(seed, cells);
    else validateV5Extensions(seed, cells);
    return cells;
  }
  // One flood fill validates arbitrary input order without repeated quadratic pending scans.
  const queue = cells.filter((p) => touchesLand(p, seed, version, []));
  const visited = new Set(queue.map((p) => `${p.x},${p.z}`));
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!;
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const x = p.x + dx!,
        z = p.z + dz!,
        key = `${x},${z}`;
      if (!keys.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push({ x, z });
    }
  }
  requireRule(visited.size === cells.length, '扩地必须与小岛相连');
  return cells;
}
export function touchesLand(
  p: LandCell,
  seed: number,
  version: TerrainVersion,
  extensions: readonly LandCell[],
): boolean {
  return [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ].some(([dx, dz]) => isLandCell(p.x + dx!, p.z + dz!, seed, version, extensions));
}
/** Reserve the water under the visible two-cell pier, not only the first exit row. */
export function blocksDockWater(p: LandCell, buildings: readonly Building[]): boolean {
  return buildings.some((b) => {
    if (b.kind !== 'dock') return false;
    const d = CONFIG.buildings.dock;
    const width = b.rotation % 2 ? d.depth : d.width;
    const depth = b.rotation % 2 ? d.width : d.depth;
    if (b.rotation === 0)
      return p.x >= b.x && p.x < b.x + width && p.z >= b.z + depth && p.z < b.z + depth + 2;
    if (b.rotation === 2) return p.x >= b.x && p.x < b.x + width && p.z >= b.z - 2 && p.z < b.z;
    if (b.rotation === 1)
      return p.z >= b.z && p.z < b.z + depth && p.x >= b.x + width && p.x < b.x + width + 2;
    return p.z >= b.z && p.z < b.z + depth && p.x >= b.x - 2 && p.x < b.x;
  });
}
