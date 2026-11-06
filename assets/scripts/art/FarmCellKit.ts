import { riceGeometry } from './RiceGeometry';
import { carrotGeometry, wheatGeometry } from './CropGeometry';
import { growthStage } from './CropGrowth';
import { ART as C, part } from './AssetTypes';
import type { AssetRecipe, Part } from './AssetTypes';
import type { Job, Crop } from '../domain/game';
/** Nine visual stages remain independent and use the same monotonic time as gameplay. */
export function farmStages(jobs: Array<Job | null> | undefined, now: number) {
  return Array.from({ length: jobs?.length === 36 ? 36 : 9 }, (_, cell) =>
    growthStage(jobs?.[cell], now),
  );
}
export function farmBed(size: 3 | 6 = 3, irrigated = false): AssetRecipe {
  const parts: Part[] = [];
  const span = (size * 2) / 3,
    half = span / 2;
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      const x = ((col + 0.5) * 2) / 3 - half;
      const z = ((row + 0.5) * 2) / 3 - half;
      parts.push(
        part(
          `soil-${row * size + col}`,
          'box',
          [x, 0.09, z],
          [2 / 3, 0.16, 2 / 3],
          irrigated ? '#59432F' : '#765035',
        ),
      );
      if (irrigated) {
        parts.push(part('shallow-water', 'box', [x, 0.174, z], [2 / 3, 0.012, 2 / 3], '#659F9D'));
        parts.push(
          part('water-glint', 'box', [x - 0.09, 0.182, z + 0.15], [0.17, 0.003, 0.016], '#A6CFCA'),
        );
        continue;
      }
      // Long continuous ridges avoid quadrupling bed geometry in the larger field.
      if (size === 6 && row > 0) continue;
      const ridgeZ = size === 6 ? 0 : z;
      const ridgeLength = size === 6 ? span - 0.06 : 0.6;
      for (const offset of [-0.22, 0, 0.22]) {
        parts.push(
          part(
            'soft-soil-ridge',
            'gable',
            [x + offset, 0.174, ridgeZ],
            [0.18, 0.025, ridgeLength],
            '#805638',
          ),
        );
        parts.push(
          part(
            'furrow-shadow',
            'box',
            [x + offset + 0.09, 0.171, ridgeZ],
            [0.025, 0.008, ridgeLength - 0.01],
            '#61422F',
          ),
        );
      }
    }
  for (const sign of [-1, 1]) {
    parts.push(
      part(
        'low-wood-edge',
        'box',
        [sign * (half - 0.03), 0.12, 0],
        [0.05, 0.18, span - 0.01],
        C.wood,
      ),
    );
    parts.push(
      part(
        'low-wood-edge',
        'box',
        [0, 0.12, sign * (half - 0.03)],
        [span - 0.12, 0.18, 0.05],
        C.woodLight,
      ),
    );
    for (const other of [-1, 1])
      parts.push(
        part(
          'corner-peg',
          'timber',
          [sign * (half - 0.04), 0.13, other * (half - 0.04)],
          [0.09, 0.23, 0.09],
          C.woodLight,
        ),
      );
  }
  return {
    id: `${size === 6 ? 'farm-large-bed' : 'farm-cell-bed'}${irrigated ? '-water' : ''}`,
    footprint: [span, span],
    parts,
  };
}
/** Old jobs without a crop remain carrots; signatures include identity and stage. */
export function farmVisuals(jobs: Array<Job | null> | undefined, now: number) {
  return farmStages(jobs, now).map((stage, cell) =>
    stage === 'empty' ? 'empty' : `${jobs?.[cell]?.crop ?? 'vegetable'}-${stage}`,
  );
}
export function cropCell(
  stage: 'seedling' | 'young' | 'ready',
  crop: Crop = 'vegetable',
): AssetRecipe {
  const ready = stage === 'ready';
  const parts: Part[] = [];
  if (crop === 'vegetable') parts.push(...carrotGeometry(stage));
  else if (crop === 'wheat') parts.push(...wheatGeometry(stage));
  else if (crop === 'rice') parts.push(...riceGeometry(stage));
  else {
    const size = ready ? 0.29 : stage === 'young' ? 0.22 : 0.11;
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
