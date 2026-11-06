import type { DropSnapshot, LooseDrop } from '../domain/game';
/** Snapshot exactly the identity, product, quantity and saved world position shown to the player. */
export function dropSnapshot(d: LooseDrop): DropSnapshot {
  return { id: d.id, item: d.item, amount: d.amount, x6: d.x6, z6: d.z6 };
}
