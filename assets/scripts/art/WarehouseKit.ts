import { ART as C, part, move } from './AssetTypes';
import type { Part, AssetRecipe } from './AssetTypes';
export const shell = (): Part[] => [
  part('foundation', 'box', [-0.25, 0.1, -0.08], [1.22, 0.2, 1.36], C.stone),
  part('cream-walls', 'box', [-0.25, 0.69, -0.08], [1.12, 1.02, 1.22], C.plaster),
  part('gable-wall', 'gable', [-0.25, 1.36, -0.08], [1.12, 0.35, 1.22], C.plaster),
  ...[-1, 1].map((s) =>
    part('corner-post', 'box', [-0.25 + s * 0.53, 0.71, 0.55], [0.07, 1.05, 0.06], C.woodDark),
  ),
  part('side-window-frame', 'box', [0.325, 0.84, -0.06], [0.04, 0.32, 0.34], C.wood),
  part('side-window', 'box', [0.35, 0.84, -0.06], [0.02, 0.23, 0.24], C.glass),
  part('window-mullion-v', 'box', [0.365, 0.84, -0.06], [0.025, 0.24, 0.025], C.woodDark),
  part('window-mullion-h', 'box', [0.365, 0.84, -0.06], [0.025, 0.025, 0.24], C.woodDark),
  ...[-2, -1, 0, 1, 2].map((i) =>
    part(
      'foundation-block',
      'box',
      [-0.25 + i * 0.235, 0.11, 0.612],
      [0.22, 0.17, 0.045],
      i % 2 ? '#D6C29D' : C.stone,
    ),
  ),
];
export const roof = (): Part[] => [
  part('terracotta-gable', 'gable', [-0.25, 1.45, -0.08], [1.34, 0.47, 1.44], C.roof),
  part('roof-ridge', 'box', [-0.25, 1.7, -0.08], [0.09, 0.07, 1.48], C.roofDark),
  part('front-ridge-beam', 'box', [-0.25, 1.22, 0.65], [1.3, 0.08, 0.07], C.woodDark),
  ...[-1, 1].map((side) =>
    part('gable-trim', 'box', [-0.25 + side * 0.32, 1.46, 0.665], [0.78, 0.055, 0.065], C.wood, [
      0,
      0,
      -side * 35,
    ]),
  ),
  ...[-1, 1].flatMap((side) =>
    Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 4 }, (_, col) => {
        const x = 0.12 + row * 0.215;
        return part(
          'roof-tile',
          'box',
          [-0.25 + side * x, 1.685 - x * 0.701 + 0.024, -0.62 + col * 0.36],
          [0.285, 0.035, 0.35],
          (row + col) % 3 === 0 ? '#DC7546' : C.roof,
          [0, 0, -side * 35],
        );
      }),
    ).flat(),
  ),
];
export const door = (cold = false): Part[] => [
  part('door-frame', 'box', [-0.25, 0.65, 0.55], [0.66, 0.86, 0.07], C.wood),
  part(
    'teal-double-door',
    'box',
    [-0.25, 0.64, 0.6],
    [0.55, 0.75, 0.06],
    cold ? C.tealLight : C.teal,
  ),
  part('door-seam', 'box', [-0.25, 0.64, 0.635], [0.015, 0.75, 0.015], C.tealDark),
  ...[-1, 1].map((s) =>
    part('handle', 'box', [-0.25 + s * 0.05, 0.61, 0.65], [0.025, 0.13, 0.025], C.woodDark),
  ),
];
export const deck = (): Part[] => [
  part('loading-deck', 'box', [-0.25, 0.2, 0.74], [1.24, 0.12, 0.38], C.woodLight),
  ...[-1, 1].map((s) =>
    part('deck-leg', 'box', [-0.25 + s * 0.48, 0.08, 0.82], [0.09, 0.16, 0.09], C.woodDark),
  ),
  part('step', 'box', [-0.25, 0.09, 0.94], [0.44, 0.12, 0.1], C.wood),
];
export const wing = (): Part[] => [
  part('wing-base', 'box', [0.61, 0.1, -0.12], [0.56, 0.2, 1.3], C.stone),
  part('wing-wall', 'box', [0.61, 0.52, -0.12], [0.53, 0.72, 1.24], C.plaster),
  part('wing-roof', 'box', [0.61, 0.94, -0.12], [0.65, 0.12, 1.4], C.roof, [0, 0, -8]),
  part('wing-window', 'box', [0.61, 0.61, 0.52], [0.25, 0.18, 0.03], C.tealDark),
];
export const cooling = (): Part[] => [
  part('cooling-body', 'box', [0, 0.43, 0], [0.62, 0.68, 0.58], C.tealLight),
  ...[-1, 1].map((s) =>
    part('cooler-foot', 'box', [s * 0.22, 0.06, 0], [0.17, 0.12, 0.64], C.stone),
  ),
  part('grille', 'box', [0, 0.43, 0.3], [0.44, 0.4, 0.025], C.tealDark),
  ...[-1, 0, 1].map((i) =>
    part('vent-slat', 'box', [0, 0.43 + i * 0.1, 0.32], [0.43, 0.035, 0.04], C.teal),
  ),
  part('fan', 'gem', [0, 0.79, 0], [0.38, 0.035, 0.38], C.tealDark),
  part('pipe', 'box', [0.36, 0.38, 0], [0.09, 0.14, 0.12], C.teal),
];
export function warehouse(
  id: 'warehouse-base' | 'warehouse-expanded' | 'warehouse-cold',
): AssetRecipe {
  const parts = [...shell(), ...roof(), ...door(id === 'warehouse-cold'), ...deck()];
  if (id === 'warehouse-expanded') parts.push(...wing());
  if (id === 'warehouse-cold') {
    parts.push(...move(cooling(), [0.61, 0, -0.08], 0.8));
    parts.push(part('cold-mark-v', 'box', [-0.25, 0.84, 0.64], [0.025, 0.16, 0.02], '#EDF1DB'));
    parts.push(part('cold-mark-h', 'box', [-0.25, 0.84, 0.64], [0.14, 0.025, 0.02], '#EDF1DB'));
  }
  return {
    id,
    footprint: [2, 2],
    parts,
    sockets: { side: [0.61, 0, -0.08], front: [-0.25, 0, 0.74] },
  };
}
