import { footprint, farmBoxCell } from '../domain/game';
import type { Command, GameState, Item, Tool } from '../domain/game';
import { farmCellCenter } from './FarmCells';
import type { SurfacePoint } from './NaturalPicking';
export interface CollectionGain {
  kind: Item | Tool;
  amount: number;
}
export interface CollectionEvent {
  command: Command;
  before: GameState;
  gains: CollectionGain[];
}
/** Compare committed state only. Rejected commands, spending and moving piles produce no rewards. */
export function collectionGains(before: GameState, after: GameState): CollectionGain[] {
  const gains: CollectionGain[] = [];
  for (const kind of Object.keys(after.inventory) as Item[]) {
    const amount = after.inventory[kind] - before.inventory[kind];
    if (amount > 0) gains.push({ kind, amount });
  }
  for (const kind of Object.keys(after.tools) as Tool[]) {
    const amount = after.tools[kind] - before.tools[kind];
    if (amount > 0) gains.push({ kind, amount });
  }
  return gains;
}
/** World collection origins; purchases/replenishment instead use the actual clicked UI point. */
export function collectionOrigin(
  event: CollectionEvent,
  naturalOrigin?: (id: string) => SurfacePoint | null,
  dropOrigin?: (id: string) => SurfacePoint | null,
): { x: number; y: number; z: number } | null {
  const { command: c, before } = event;
  if (c.type === 'pickupDrop') return dropOrigin?.(c.dropId) ?? null;
  if (c.type === 'pickupProduct' || c.type === 'pickupStack')
    return { x: c.x + 0.5, y: 0.4, z: c.z + 0.5 };
  if (c.type === 'gatherNatural') {
    const resource = before.naturalResources.find((item) => item.id === c.resourceId);
    return resource ? (naturalOrigin?.(resource.id) ?? null) : null;
  }
  if (c.type === 'useTool') {
    if (c.tool === 'saw') return { x: c.x + 0.5, y: 0.4, z: c.z + 0.5 };
    if (c.tool === 'axe') {
      const tree = before.trees.find((t) => t.id === c.treeId);
      return tree ? { x: tree.x + 0.5, y: 1, z: tree.z + 0.5 } : null;
    }
  }
  if ('buildingId' in c) {
    const b = before.buildings.find((item) => item.id === c.buildingId);
    if (!b) return null;
    if (c.type === 'withdrawFarmBox') {
      const box = farmBoxCell(b);
      return box ? { x: box.x + 0.5, y: 0.6, z: box.z + 0.5 } : null;
    }
    if (c.type === 'harvestCell') return { ...farmCellCenter(b, c.cell), y: 0.3 };
    const f = footprint(b);
    return { x: b.x + f.width / 2, y: b.kind === 'farm' ? 0.3 : 1, z: b.z + f.depth / 2 };
  }
  return null;
}
