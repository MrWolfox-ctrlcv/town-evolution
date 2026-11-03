import { Node } from 'cc';
import { isCrop } from '../domain/game';
import type { GroundStack, Item } from '../domain/game';
import type { ModelFactory } from './ModelFactory';
const SHADES: Record<Item, string> = {
  vegetable: '#DC893B',
  wheat: '#E7C25A',
  lettuce: '#7CA65C',
  chilledVegetable: '#8EBCC1',
  wood: '#AA7548',
  stone: '#909899',
};
export function pileModel(factory: ModelFactory, pile: GroundStack, name = 'GroundPile'): Node {
  const root = new Node(name);
  root.setPosition(pile.x + 0.5, 0, pile.z + 0.5);
  factory.shape(root, 'StackBase', 0, 0.06, 0, 0.86, 0.05, 0.86, '#D7C598');
  for (let i = 0; i < pile.amount; i++) {
    const wood = pile.item === 'wood';
    const x = ((i % 2) - 0.5) * 0.34,
      y = 0.1 + Math.floor(i / 2) * 0.19;
    if (isCrop(pile.item) || pile.item === 'stone') {
      const unit = factory.asset(
        pile.item === 'stone' ? 'rock' : `crop-cell-${pile.item}-ready`,
        `Unit${i + 1}`,
      );
      unit.setPosition(x, y, 0);
      unit.setScale(0.32, 0.32, 0.32);
      unit.setRotationFromEuler(0, i * 29, 0);
      root.addChild(unit);
      continue;
    }
    const unit = factory.shape(
      root,
      `Unit${i + 1}`,
      ((i % 2) - 0.5) * 0.34,
      0.19 + Math.floor(i / 2) * 0.19,
      0,
      wood ? 0.27 : 0.25,
      0.17,
      wood ? 0.7 : 0.28,
      SHADES[pile.item],
      wood ? 'cylinder' : 'box',
    );
    if (wood) {
      unit.setScale(0.26, 0.7, 0.26);
      unit.setRotationFromEuler(90, 0, 0);
      for (const side of [-1, 1]) {
        const cap = factory.shape(
          root,
          'LogEnd',
          x,
          0.19 + Math.floor(i / 2) * 0.19,
          side * 0.355,
          0.22,
          0.012,
          0.22,
          '#DDB57A',
          'cylinder',
        );
        cap.setRotationFromEuler(90, 0, 0);
      }
    } else unit.setRotationFromEuler(0, i * 19, 0);
  }
  return root;
}
