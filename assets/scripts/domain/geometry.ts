import type { GameState, Building } from './types';
import { CONFIG } from './config';
import { requireRule, integer } from './guards';
export function footprint(b: Pick<Building, 'kind' | 'rotation'>): {
  width: number;
  depth: number;
} {
  const d = CONFIG.buildings[b.kind];
  return b.rotation === 1 ? { width: d.depth, depth: d.width } : { width: d.width, depth: d.depth };
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
  requireRule(
    !state.buildings.some((other) => other.id !== b.id && overlaps(b, other)),
    '此处已有建筑',
  );
}
