import { ART as C, part } from './AssetTypes';
import type { AssetRecipe, Part } from './AssetTypes';
import type { Job, Crop } from '../domain/game';
/** Nine visual stages remain independent and use the same monotonic time as gameplay. */
export function farmStages(jobs: Array<Job | null> | undefined, now: number) {
  return Array.from({ length: 9 }, (_, cell) =>
    !jobs?.[cell] ? 'empty' : now >= jobs[cell]!.readyAt ? 'ready' : 'seedling',
  );
}
export function farmBed(): AssetRecipe {
  const parts: Part[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      const x = ((col + 0.5) * 2) / 3 - 1;
      const z = ((row + 0.5) * 2) / 3 - 1;
      parts.push(
        part(`soil-${row * 3 + col}`, 'box', [x, 0.09, z], [2 / 3, 0.16, 2 / 3], '#765035'),
      );
      for (const offset of [-0.22, 0, 0.22]) {
        parts.push(
          part('soft-soil-ridge', 'gable', [x + offset, 0.174, z], [0.18, 0.025, 0.6], '#805638'),
        );
        parts.push(
          part(
            'furrow-shadow',
            'box',
            [x + offset + 0.09, 0.171, z],
            [0.025, 0.008, 0.59],
            '#61422F',
          ),
        );
      }
    }
  for (const sign of [-1, 1]) {
    parts.push(part('low-wood-edge', 'box', [sign * 0.97, 0.12, 0], [0.05, 0.18, 1.99], C.wood));
    parts.push(
      part('low-wood-edge', 'box', [0, 0.12, sign * 0.97], [1.88, 0.18, 0.05], C.woodLight),
    );
    for (const other of [-1, 1])
      parts.push(
        part(
          'corner-peg',
          'timber',
          [sign * 0.96, 0.13, other * 0.96],
          [0.09, 0.23, 0.09],
          C.woodLight,
        ),
      );
  }
  return { id: 'farm-cell-bed', footprint: [2, 2], parts };
}
/** Old jobs without a crop remain carrots; signatures include identity and stage. */
export function farmVisuals(jobs: Array<Job | null> | undefined, now: number) {
  return farmStages(jobs, now).map((stage, cell) =>
    stage === 'empty' ? 'empty' : `${jobs?.[cell]?.crop ?? 'vegetable'}-${stage}`,
  );
}
export function cropCell(stage: 'seedling' | 'ready', crop: Crop = 'vegetable'): AssetRecipe {
  const ready = stage === 'ready';
  const parts: Part[] = [];
  if (crop === 'vegetable') {
    for (const x of [-0.15, 0.15])
      for (const z of [-0.15, 0.15]) {
        if (ready)
          parts.push(part('carrot-root', 'crown', [x, 0.225, z], [0.15, 0.15, 0.15], '#E98A32'));
        for (let leaf = 0; leaf < 3; leaf++) {
          const angle = (leaf * Math.PI * 2) / 3;
          parts.push(
            part(
              'carrot-frond',
              'gem',
              [x + Math.cos(angle) * 0.045, ready ? 0.34 : 0.24, z + Math.sin(angle) * 0.045],
              [0.13, ready ? 0.24 : 0.12, 0.085],
              leaf === 0 ? '#A4BB51' : '#6F963E',
              [0, -leaf * 120, 28],
            ),
          );
        }
      }
  } else if (crop === 'wheat') {
    for (const x of [-0.19, 0, 0.19])
      for (const z of [-0.19, 0, 0.19]) {
        const top = ready ? 0.55 + (x === 0 ? 0.07 : 0) : 0.3;
        parts.push(
          part(
            'wheat-stem',
            'box',
            [x, (top + 0.17) / 2, z],
            [0.023, top - 0.17, 0.023],
            ready ? '#B89938' : C.leaf,
          ),
        );
        parts.push(
          part(
            ready ? 'wheat-ear' : 'wheat-shoot',
            'gem',
            [x, top, z],
            [ready ? 0.11 : 0.055, ready ? 0.23 : 0.13, 0.085],
            ready ? '#E7BD4A' : C.leafLight,
            [0, 15, -8],
          ),
        );
        parts.push(
          part(
            'wheat-leaf',
            'gem',
            [x + 0.04, top - 0.15, z],
            [0.05, 0.18, 0.045],
            ready ? '#C8AA49' : C.leaf,
            [0, 0, -38],
          ),
        );
      }
  } else {
    const size = ready ? 0.29 : 0.14;
    for (const [x, z] of [
      [-0.14, -0.13],
      [0.14, 0.13],
    ] as const) {
      parts.push(
        part(
          'lettuce-heart',
          'crown',
          [x, 0.19 + size * 0.4, z],
          [size, size * 0.9, size],
          '#A7C75A',
        ),
      );
      for (let leaf = 0; leaf < 4; leaf++) {
        const angle = (leaf * Math.PI) / 2;
        parts.push(
          part(
            'lettuce-cupped-leaf',
            'gem',
            [
              x + Math.cos(angle) * size * 0.32,
              0.19 + size * 0.22,
              z + Math.sin(angle) * size * 0.32,
            ],
            [size * 0.65, size * 0.65, size * 0.55],
            leaf % 2 ? '#81AA43' : '#93B84D',
            [0, -leaf * 90, 24],
          ),
        );
      }
    }
  }
  return { id: `crop-cell-${crop}-${stage}`, footprint: [2 / 3, 2 / 3], parts };
}
