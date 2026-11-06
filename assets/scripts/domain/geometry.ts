import { validateBridgeTerrain } from './bridge-terrain';
import { farmCellAtSixths } from './farm-coordinates';
import type { GameState, Building, LooseDrop } from './types';
import { isLandCell, landCellCount } from './island';
import { hasTradeFacility } from './commerce';
import { worldSize } from './world';
import { requireRule, integer } from './guards';
import { buildingOccupiedCells, buildingOccupiesCell } from './building-cells';
export { footprint } from './building-cells';
export function overlaps(a: Building, b: Building): boolean {
  return buildingOccupiedCells(a).some((p) => buildingOccupiesCell(b, p.x, p.z));
}
export function adjacent(a: Building, b: Building): boolean {
  if (overlaps(a, b)) return false;
  return buildingOccupiedCells(a).some((p) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([x, z]) => buildingOccupiesCell(b, p.x + x!, p.z + z!)),
  );
}
function permitsDrop(b: Building, p: LooseDrop): boolean {
  const cell = farmCellAtSixths(b, p);
  return (
    b.kind === 'farm' &&
    p.source.type === 'crop' &&
    p.source.buildingId === b.id &&
    cell !== null &&
    !b.cropJobs?.[cell]
  );
}
function checkedCells(state: GameState, b: Building) {
  const size = worldSize(state.terrainVersion);
  requireRule(integer(b.x, size - 1) && integer(b.z, size - 1), '位置必须是有效网格坐标');
  const cells = buildingOccupiedCells(b);
  if (b.kind === 'woodenBridge') {
    requireRule(b.bridge, '木桥缺少跨度记录');
    validateBridgeTerrain(state, { x: b.x, z: b.z, rotation: b.rotation, length: b.bridge.length });
    return cells;
  }
  for (const p of cells) {
    requireRule(integer(p.x, size - 1) && integer(p.z, size - 1), '建筑或附加箱位超出地图');
    requireRule(
      isLandCell(p.x, p.z, state.mapSeed, state.terrainVersion, state.landExtensions),
      '此处是水域，不能建造',
    );
  }
  return cells;
}
export function validatePlacement(state: GameState, b: Building): void {
  checkedCells(state, b);
  requireRule(
    !state.buildings.some((other) => other.id !== b.id && overlaps(b, other)),
    '此处已有建筑',
  );
  const inside = (p: { x: number; z: number }) => buildingOccupiesCell(b, p.x, p.z);
  requireRule(!state.trees.some(inside), '此处有树木');
  requireRule(!state.naturalResources.some(inside), '请先采集此处的天然资源');
  requireRule(!state.groundStacks.some(inside), '请先取回地上的产品');
  requireRule(
    !state.looseDrops.some(
      (p) => inside({ x: Math.floor(p.x6 / 6), z: Math.floor(p.z6 / 6) }) && !permitsDrop(b, p),
    ),
    '请先拾取建筑位置的掉落物',
  );
}
/** Retain an empty recovery tile while the town has no trading facility. */
export function preserveTradeTile(s: GameState): void {
  if (hasTradeFacility(s)) return;
  const cells = new Set<string>();
  for (const b of s.buildings)
    for (const p of buildingOccupiedCells(b))
      if (isLandCell(p.x, p.z, s.mapSeed, s.terrainVersion, s.landExtensions))
        cells.add(`${p.x},${p.z}`);
  for (const p of [...s.trees, ...s.naturalResources, ...s.groundStacks])
    cells.add(`${p.x},${p.z}`);
  for (const p of s.looseDrops) cells.add(`${Math.floor(p.x6 / 6)},${Math.floor(p.z6 / 6)}`);
  requireRule(
    cells.size < landCellCount(s.mapSeed, s.terrainVersion, s.landExtensions),
    '请保留一格空地，避免占满小岛',
  );
}
/** Save imports validate every body and attached outside box tile without resetting assets. */
export function validateTownPlacements(state: GameState): void {
  const occupied = new Set<string>(),
    trees = new Set(state.trees.map((p) => `${p.x},${p.z}`)),
    resources = new Set(state.naturalResources.map((p) => `${p.x},${p.z}`)),
    piles = new Set(state.groundStacks.map((p) => `${p.x},${p.z}`));
  for (const b of state.buildings) {
    const cells = checkedCells(state, b);
    requireRule(
      !state.looseDrops.some(
        (p) =>
          buildingOccupiesCell(b, Math.floor(p.x6 / 6), Math.floor(p.z6 / 6)) && !permitsDrop(b, p),
      ),
      '掉落物被建筑占用',
    );
    for (const p of cells) {
      const key = `${p.x},${p.z}`;
      requireRule(!occupied.has(key), '此处已有建筑');
      requireRule(!trees.has(key), '此处有树木');
      requireRule(!resources.has(key), '请先采集此处的天然资源');
      requireRule(!piles.has(key), '请先取回地上的产品');
      occupied.add(key);
    }
  }
}
