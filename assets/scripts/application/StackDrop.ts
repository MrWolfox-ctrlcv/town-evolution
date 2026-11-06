import {
  stackLimitFor,
  stackIntoDropPlan,
  dropPosition,
  footprint,
  isLandCell,
  isGroundTradeItem,
  isCompostItem,
  COMMERCE,
} from '../domain/game';
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
  state?: GameState,
): Command | null {
  const pile = state?.groundStacks.find((p) => p.x === source.x && p.z === source.z);
  if (target.kind === 'products') return { type: 'pickupStack', ...source };
  if (target.kind === 'building') {
    if (pile && target.building.kind === 'compostBarrel' && isCompostItem(pile.item))
      return {
        type: 'depositCompost',
        buildingId: target.building.id,
        quantity: pile.amount,
        source: { type: 'ground', stack: { ...pile } },
      };
    if (pile && isGroundTradeItem(pile.item)) {
      const cargo = {
        buildingId: target.building.id,
        item: pile.item,
        quantity: pile.amount,
        source: { x: source.x, z: source.z },
      };
      if (target.building.kind === 'shop') return { type: 'shopTrade', ...cargo, side: 'sell' };
      if (target.building.kind === 'dock')
        return { type: 'dockTransfer', ...cargo, direction: 'stage' };
    }
    if (pile?.item === 'mud' && ['crate', 'house'].includes(target.building.kind))
      return {
        type: 'attachMaterial',
        buildingId: target.building.id,
        item: 'mud',
        quantity: 1,
        source: { ...pile },
      };
    if (pile?.item === 'treeSeed' && target.building.kind === 'nursery')
      return { type: 'seedNursery', buildingId: target.building.id, source: { ...source } };
    if (
      !['warehouse', 'expandedWarehouse', 'coldWarehouse', 'transportWarehouse'].includes(
        target.building.kind,
      )
    )
      return null;
    return { type: 'pickupStack', ...source, warehouseId: target.building.id };
  }
  if (
    target.kind === 'ground' &&
    pile?.item === 'sapling' &&
    !state?.groundStacks.some(
      (entry) => entry.x === target.x && entry.z === target.z && entry !== pile,
    )
  )
    return { type: 'plantSapling', x: target.x, z: target.z, source: { ...source } };
  if (
    target.kind === 'ground' &&
    pile?.item === 'mud' &&
    state &&
    !isLandCell(target.x, target.z, state.mapSeed, state.terrainVersion, state.landExtensions)
  )
    return { type: 'expandLand', fromX: source.x, fromZ: source.z, x: target.x, z: target.z };
  return target.kind === 'ground'
    ? { type: 'moveStack', fromX: source.x, fromZ: source.z, x: target.x, z: target.z }
    : null;
}
export function stackDropHint(state: GameState, command: Command): string {
  if (command.type === 'mergeStackIntoDrop') {
    const { transferAmount: amount, remaining } = stackIntoDropPlan(state, command);
    return remaining ? `合并${amount}份 · 余下留原地` : `松手合并${amount}份`;
  }
  if (command.type === 'depositCompost') return `松手投入${command.quantity}份`;
  if (command.type === 'pickupStack') return '松手收回仓库';
  if (command.type === 'shopTrade' && isGroundTradeItem(command.item))
    return `松手卖${command.quantity}份 · +${command.quantity * COMMERCE.prices[command.item].sell}币`;
  if (command.type === 'dockTransfer') return `松手装货${command.quantity}份 · 不会卖出`;
  if (command.type === 'attachMaterial') return '松手放入1份材料';
  if (command.type === 'seedNursery') return '松手种下1份树种';
  if (command.type === 'plantSapling') return '松手种下1份树苗';
  if (command.type !== 'moveStack') return '';
  const source = state.groundStacks.find((p) => p.x === command.fromX && p.z === command.fromZ);
  const target = state.groundStacks.find((p) => p.x === command.x && p.z === command.z);
  if (source?.item === 'mud') return '';
  if (!source || !target || source === target) return '松手移动';
  const amount = Math.min(source.amount, stackLimitFor(source.item) - target.amount);
  return amount < source.amount ? `合并${amount}份 · 余下留原地` : `松手合并${amount}份`;
}
export function stackDropMarker(state: GameState, command: Command) {
  if (command.type === 'mergeStackIntoDrop')
    return { ...dropPosition(command.target), width: 0.3, depth: 0.3 };
  if (
    command.type === 'moveStack' ||
    command.type === 'expandLand' ||
    command.type === 'plantSapling'
  )
    return { x: command.x + 0.5, z: command.z + 0.5, width: 0.95, depth: 0.95 };
  if (
    (command.type === 'pickupStack' && command.warehouseId) ||
    command.type === 'buildResidence' ||
    command.type === 'attachMaterial' ||
    command.type === 'seedNursery' ||
    command.type === 'depositCompost' ||
    command.type === 'shopTrade' ||
    command.type === 'dockTransfer'
  ) {
    const id = command.type === 'pickupStack' ? command.warehouseId : command.buildingId;
    const building = state.buildings.find((b) => b.id === id);
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
