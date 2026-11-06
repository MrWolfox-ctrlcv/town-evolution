import type { NurseryStage } from '../domain/nursery';
import { ART as C, move, part } from './AssetTypes';
import type { AssetRecipe, Part } from './AssetTypes';
import { woodenCrate } from './BuildingAccessories';

/** One tree seed produces one identifiable shoot, rather than a field of unrelated vegetables. */
function shootParts(height: number, mature: boolean): Part[] {
  const parts = [
    part('sapling-main-stem', 'grain', [0, height / 2, 0], [0.028, height, 0.028], '#6F8540'),
  ];
  for (const [level, side] of [
    [0.46, -1],
    [0.62, 1],
    [0.86, -1],
    [0.93, 1],
  ] as const) {
    if (!mature && level < 0.8) continue;
    const width = mature ? 0.1 : 0.075;
    const length = mature ? 0.15 : 0.1;
    parts.push(
      part(
        'sapling-leaf-stem',
        'grain',
        [side * 0.025, height * level, 0],
        [0.012, 0.075, 0.012],
        '#789444',
        [0, 0, -side * 58],
      ),
      part(
        'sapling-broad-leaf',
        'ribbon',
        [side * 0.068, height * level + 0.026, (level > 0.8 ? -1 : 1) * 0.018],
        [width, length, 0.055],
        side < 0 ? '#A8C451' : '#8DAE43',
        [18, side * 28, -side * 63],
      ),
    );
  }
  return parts;
}

/** The original crate mesh remains byte-for-byte as the first assembly in every stage. */
export function nursery(stage: NurseryStage = 'empty'): AssetRecipe {
  const wet = stage === 'growing' || stage === 'ready';
  const parts: Part[] = [
    ...woodenCrate(),
    part(
      'nursery-mud-fill',
      'box',
      [0, 0.215, 0],
      [0.37, 0.29, 0.37],
      wet ? '#5F4533' : C.soilDark,
    ),
    ...[
      [-0.12, -0.09],
      [0.11, 0.105],
      [-0.095, 0.11],
      [0.08, -0.11],
    ].map(([x, z], i) =>
      part(
        'nursery-mud-crumb',
        'crown',
        [x!, 0.362, z!],
        [0.048, 0.026, 0.04],
        i % 2 ? '#9C7752' : '#806044',
      ),
    ),
  ];
  if (stage === 'seeded')
    parts.push(
      part('nursery-tree-seed', 'crown', [0, 0.368, 0], [0.075, 0.055, 0.065], '#AD7D41'),
      part('nursery-tree-seed-cap', 'crown', [-0.018, 0.39, 0], [0.05, 0.03, 0.067], '#755535'),
    );
  if (wet)
    parts.push(
      part('nursery-damp-glint', 'crown', [0.115, 0.366, -0.075], [0.045, 0.008, 0.025], '#9CA594'),
      ...move(shootParts(stage === 'ready' ? 0.38 : 0.19, stage === 'ready'), [0, 0.36, 0]),
    );
  return { id: `nursery-${stage}`, footprint: [1, 1], parts };
}

/** A lifted sapling keeps its own small root ball, unlike a planted, fully grown resource tree. */
export function saplingProductUnit(): Part[] {
  return [
    part('sapling-root-ball', 'crown', [0, 0.06, 0], [0.17, 0.12, 0.17], '#75513A'),
    part('sapling-root-binding', 'binding', [0, 0.065, 0], [0.17, 0.105, 0.014], '#C5AA72'),
    ...move(shootParts(0.35, true), [0, 0.1, 0], 0.75),
  ];
}

export function sapling(): AssetRecipe {
  return { id: 'sapling', footprint: [1, 1], parts: saplingProductUnit() };
}
