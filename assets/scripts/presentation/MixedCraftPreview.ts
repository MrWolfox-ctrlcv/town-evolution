import type { Node } from 'cc';
import type { Command, GroundStack } from '../domain/game';
import type { ModelFactory } from './ModelFactory';
/** Graphic-only selected units and result. No recipe text or inventory-derived ingredients. */
export function mixedCraftPreview(
  root: Node,
  factory: ModelFactory,
  command: Extract<Command, { type: 'craftMixed' }>,
  originX: number,
  originZ: number,
  valid: boolean,
): void {
  mixedSourceRings(root, factory, command.sources, originX, originZ, valid);
  for (const source of command.sources) {
    const x = source.x + 0.5 - originX,
      z = source.z + 0.5 - originZ;
    const unit = factory.asset(`pile-${source.item}-1`, 'SelectedMixedUnit');
    unit.setPosition(x, 0.6, z);
    unit.setScale(0.65, 0.65, 0.65);
    root.addChild(unit);
  }
  if (valid) {
    const oven = factory.asset('stone-oven', 'MixedCraftResult');
    oven.setPosition(command.x + 0.5 - originX, 0.025, command.z + 0.5 - originZ);
    root.addChild(oven);
  }
}

export function mixedSourceRings(
  root: Node,
  factory: ModelFactory,
  sources: readonly GroundStack[],
  originX: number,
  originZ: number,
  valid: boolean,
): void {
  for (const source of sources)
    for (const side of [-1, 1])
      factory.shape(
        root,
        'MixedSource',
        source.x + 0.5 - originX + side * 0.46,
        0.15,
        source.z + 0.5 - originZ,
        0.06,
        0.05,
        0.88,
        valid ? '#84CED0' : '#D97168',
      );
}
