import { FOUNDATION, footprint } from '../domain/game';
import type { Building, Command, GameState } from '../domain/game';
export type StackTarget =
  | { kind: 'products' }
  | { kind: 'building'; building: Building }
  | { kind: 'ground'; x: number; z: number }
  | { kind: 'blocked' };
/** UI routing only; the domain remains authoritative for capacity and atomic changes. */
export function stackDropCommand(
  source: { x: number; z: number },
  target: StackTarget,
): Command | null {
  if (target.kind === 'products') return { type: 'pickupStack', ...source };
  if (target.kind === 'building') {
    if (!['warehouse', 'expandedWarehouse', 'coldWarehouse'].includes(target.building.kind))
      return null;
    return { type: 'pickupStack', ...source, warehouseId: target.building.id };
  }
  return target.kind === 'ground'
    ? { type: 'moveStack', fromX: source.x, fromZ: source.z, x: target.x, z: target.z }
    : null;
}
export function stackDropHint(state: GameState, command: Command): string {
  if (command.type === 'pickupStack') return '松手收回仓库';
  if (command.type !== 'moveStack') return '';
  const source = state.groundStacks.find((p) => p.x === command.fromX && p.z === command.fromZ);
  const target = state.groundStacks.find((p) => p.x === command.x && p.z === command.z);
  if (!source || !target || source === target) return '松手移动';
  const amount = Math.min(source.amount, FOUNDATION.stackLimit - target.amount);
  return amount < source.amount ? `合并${amount}份 · 余下留原地` : `松手合并${amount}份`;
}
export function stackDropMarker(state: GameState, command: Command) {
  if (command.type === 'moveStack')
    return { x: command.x + 0.5, z: command.z + 0.5, width: 0.95, depth: 0.95 };
  if (command.type === 'pickupStack' && command.warehouseId) {
    const building = state.buildings.find((b) => b.id === command.warehouseId);
    if (building) {
      const size = footprint(building);
      return { x: building.x + size.width / 2, z: building.z + size.depth / 2, ...size };
    }
  }
  return null;
}

export interface ProductDropSurface {
  acceptsProductDrop(point: { x: number; y: number }): boolean;
  highlightProductDrop(point: { x: number; y: number } | null, valid: boolean): void;
}
