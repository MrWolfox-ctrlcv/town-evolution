import { Node } from 'cc';
import { CONFIG } from '../domain/game';
import type { BuildingKind, GroundStack, Stock } from '../domain/game';
import { PRODUCTS } from '../art/ProductPileKit';
import type { ModelFactory } from './ModelFactory';
/** Quantity changes the actual arrangement, with no display tile under the goods. */
export function pileModel(factory: ModelFactory, pile: GroundStack, name = 'GroundPile'): Node {
  const root = new Node(name);
  root.setPosition(pile.x + 0.5, 0.024, pile.z + 0.5);
  const visualAmount = Number.isInteger(pile.amount)
    ? pile.amount
    : Math.max(1, Math.ceil(pile.amount));
  root.addChild(factory.asset(`pile-${pile.item}-${visualAmount}`, 'HarvestedGoods'));
  return root;
}
/** Attached goods wait beside the building, instead of levitating over its roof. */
export function attachmentModel(
  factory: ModelFactory,
  stock: Stock,
  kind: BuildingKind,
  farmSize?: 6,
): Node {
  const root = new Node('AttachedMaterials');
  const cfg = CONFIG.buildings[kind];
  let count = 0;
  for (const item of PRODUCTS) {
    const amount = Math.min(5 - count, stock[item] ?? 0);
    for (let i = 0; i < amount; i++) {
      const token = pileModel(
        factory,
        { x: 0, z: 0, item, amount: 1 },
        `Attached-${item}-${count}`,
      );
      token.setPosition(
        (kind === 'farm' && farmSize === 6 ? 4 : cfg.width) / 2 + 0.1,
        0.024,
        (count - 2) * 0.24,
      );
      token.setScale(0.6, 0.6, 0.6);
      root.addChild(token);
      count++;
    }
    if (count >= 5) break;
  }
  return root;
}
