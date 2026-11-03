import type { GameState, Item, Command } from '../domain/game';
export type QuantityPreset = 1 | 4 | 'all';
export function tradeQuantity(
  state: GameState,
  buildingId: string,
  item: Item,
  preset: QuantityPreset,
  source: 'inventory' | 'shop' | 'dock',
): number {
  if (preset !== 'all') return preset;
  const stock =
    source === 'inventory'
      ? state.inventory
      : source === 'shop'
        ? state.commerce.shopStock[buildingId]
        : state.commerce.dockCargo[buildingId];
  return stock?.[item] ?? 0;
}
export function nextQuantity(preset: QuantityPreset): QuantityPreset {
  return preset === 1 ? 4 : preset === 4 ? 'all' : 1;
}

/** Dragging an inventory chip is a deliberate single-unit drop, never an implicit sell-all. */
export function stockDropCommand(
  state: GameState,
  item: Item,
  targetId: string | null,
): Command | null {
  const target = state.buildings.find((b) => b.id === targetId);
  if (target?.kind === 'shop')
    return { type: 'shopTrade', buildingId: target.id, item, quantity: 1, side: 'sell' };
  if (target?.kind === 'dock')
    return { type: 'dockTransfer', buildingId: target.id, item, quantity: 1, direction: 'stage' };
  return null;
}

/** Old processed goods remain clearable, but are not offered as a new crop. */
export function tradeItems(state: GameState): Item[] {
  const legacy =
    state.inventory.chilledVegetable > 0 ||
    Object.values(state.commerce.dockCargo).some((cargo) => cargo.chilledVegetable > 0) ||
    Object.values(state.commerce.shipments).some((ship) => ship.cargo.chilledVegetable > 0);
  const items: Item[] = ['vegetable', 'wheat', 'lettuce'];
  for (const item of ['wood', 'stone'] as const)
    if (
      state.inventory[item] > 0 ||
      Object.values(state.commerce.dockCargo).some((cargo) => cargo[item] > 0) ||
      Object.values(state.commerce.shipments).some((ship) => ship.cargo[item] > 0)
    )
      items.push(item);
  if (legacy) items.push('chilledVegetable');
  return items;
}
