import type { GameState, Building } from './types';
import { isLandCell, landCellCount } from './island';
import { hasTradeFacility } from './commerce';
import { CONFIG } from './config';
import { requireRule, integer } from './guards';
export function footprint(b: Pick<Building, 'kind' | 'rotation'>): {
  width: number;
  depth: number;
} {
  const d = CONFIG.buildings[b.kind];
  return b.rotation % 2 === 1
    ? { width: d.depth, depth: d.width }
    : { width: d.width, depth: d.depth };
}
export function overlaps(a: Building, b: Building): boolean {
  const x = footprint(a),
    y = footprint(b);
  return a.x < b.x + y.width && a.x + x.width > b.x && a.z < b.z + y.depth && a.z + x.depth > b.z;
}
export function adjacent(a: Building, b: Building): boolean {
  const x = footprint(a),
    y = footprint(b);
  const horizontal =
    (a.x + x.width === b.x || b.x + y.width === a.x) && a.z < b.z + y.depth && a.z + x.depth > b.z;
  const vertical =
    (a.z + x.depth === b.z || b.z + y.depth === a.z) && a.x < b.x + y.width && a.x + x.width > b.x;
  return horizontal || vertical;
}
export function validatePlacement(state: GameState, b: Building): void {
  const d = footprint(b);
  requireRule(
    integer(b.x, CONFIG.gridSize) && integer(b.z, CONFIG.gridSize),
    '位置必须是有效网格坐标',
  );
  requireRule(b.x + d.width <= CONFIG.gridSize && b.z + d.depth <= CONFIG.gridSize, '建筑超出地图');
  for (let dx = 0; dx < d.width; dx++)
    for (let dz = 0; dz < d.depth; dz++)
      requireRule(isLandCell(b.x + dx, b.z + dz, state.mapSeed), '此处是水域，不能建造');
  requireRule(
    !state.buildings.some((other) => other.id !== b.id && overlaps(b, other)),
    '此处已有建筑',
  );
  const inside = (p: { x: number; z: number }) =>
    p.x >= b.x && p.x < b.x + d.width && p.z >= b.z && p.z < b.z + d.depth;
  requireRule(!state.trees.some(inside), '此处有树木');
  requireRule(!state.groundStacks.some(inside), '请先取回地上的产品');
}

/** Same free-board escape tile reserved by ordinary construction. */
export function preserveTradeTile(s: GameState): void {
  if (hasTradeFacility(s)) return;
  const occupied =
    s.buildings.reduce((sum, b) => {
      const size = footprint(b);
      return sum + size.width * size.depth;
    }, 0) +
    s.trees.length +
    s.groundStacks.length;
  requireRule(occupied < landCellCount(s.mapSeed), '请为免费订单板保留一格空地');
}
