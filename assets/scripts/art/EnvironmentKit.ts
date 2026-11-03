import { treeParts } from './TreeKit';
import { ART as C, part } from './AssetTypes';
import type { AssetRecipe, Part } from './AssetTypes';
export function farm(stage: 'empty' | 'seedling' | 'ready'): AssetRecipe {
  const parts: Part[] = [part('soil', 'box', [0, 0.09, 0], [1.8, 0.16, 1.8], C.soil)];
  for (const s of [-1, 1]) {
    parts.push(part('bed-side', 'box', [s * 0.91, 0.15, 0], [0.1, 0.2, 1.94], C.woodLight));
    parts.push(part('bed-end', 'box', [0, 0.15, s * 0.91], [1.8, 0.2, 0.1], C.wood));
  }
  for (const x of [-0.55, 0, 0.55])
    parts.push(part('furrow', 'box', [x, 0.18, 0], [0.08, 0.035, 1.6], C.soilDark));
  if (stage !== 'empty')
    for (const x of [-0.55, 0, 0.55])
      for (const z of [-0.55, 0, 0.55]) {
        const size = stage === 'ready' ? 0.38 : 0.17;
        parts.push(
          part('cabbage', 'gem', [x, 0.2 + size * 0.35, z], [size, size * 0.8, size], C.leaf),
        );
        for (const s of [-1, 1])
          parts.push(
            part(
              'leaf',
              'gem',
              [x + s * size * 0.28, 0.2 + size * 0.5, z],
              [size * 0.6, size * 0.65, size * 0.7],
              C.leafLight,
              [0, s * 25, s * -20],
            ),
          );
      }
  return { id: `farm-${stage}`, footprint: [2, 2], parts };
}
export const crate = (): Part[] => [
  part('crate-body', 'box', [0, 0.22, 0], [0.42, 0.44, 0.42], C.wood),
  ...[-1, 1].flatMap((s) => [
    part('crate-rim', 'box', [0, 0.22 + s * 0.18, 0.22], [0.44, 0.055, 0.04], C.woodLight),
    part('crate-post', 'box', [s * 0.18, 0.22, 0.22], [0.05, 0.4, 0.04], C.woodLight),
  ]),
  part('crate-brace', 'box', [0, 0.22, 0.25], [0.055, 0.5, 0.035], C.woodLight, [0, 0, 40]),
];
export function environment(id: 'crate' | 'fence' | 'tree' | 'rock' | 'path'): AssetRecipe {
  let parts: Part[];
  if (id === 'crate') parts = crate();
  else if (id === 'fence')
    parts = [
      ...[-1, 1].map((s) => part('post', 'box', [s * 0.42, 0.4, 0], [0.12, 0.8, 0.12], C.wood)),
      ...[-1, 1].map((s) =>
        part('rail', 'box', [0, 0.43 + s * 0.15, 0], [0.88, 0.09, 0.08], C.woodLight),
      ),
    ];
  else if (id === 'tree') parts = treeParts();
  else if (id === 'rock')
    parts = [part('stone', 'gem', [0, 0.18, 0], [0.8, 0.52, 0.65], C.rock, [0, 22, 12])];
  else
    parts = [
      part('grass-tile', 'box', [0, 0.035, 0], [1, 0.07, 1], C.grass),
      part('sand-path', 'box', [0, 0.076, 0], [0.72, 0.03, 1], C.path),
      ...[-1, 0, 1].map((i) =>
        part(
          'paving-stone',
          'gem',
          [(i % 2) * 0.12, 0.1, i * 0.3],
          [0.45, 0.035, 0.22],
          C.plaster,
          [0, i * 15, 0],
        ),
      ),
    ];
  return { id, footprint: [id === 'tree' ? 1.2 : 1, id === 'tree' ? 1.2 : 1], parts };
}
