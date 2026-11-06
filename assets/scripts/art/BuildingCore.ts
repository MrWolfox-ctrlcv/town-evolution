import { ART as C, part } from './AssetTypes';
import type { Part, V3 } from './AssetTypes';

/** Generated wood is limited to attachment components; the established house is unchanged. */
export function wood(name: string, position: V3, size: V3, rotation?: V3, tint = '#F8E6CE'): Part {
  return { ...part(name, 'box', position, size, tint, rotation), texture: 'warm-wood' };
}
/** Exact pre-upgrade house shell and roof, retained as shared components. */
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

/** Original small house entrance, front window, steps and chimney. */
export const door = (): Part[] => [
  part('home-door-frame', 'box', [-0.48, 0.61, 0.56], [0.4, 0.86, 0.09], C.woodDark),
  part('home-door', 'box', [-0.48, 0.6, 0.62], [0.31, 0.77, 0.055], C.woodLight),
  part('home-handle', 'gem', [-0.38, 0.57, 0.66], [0.045, 0.045, 0.035], '#E6C16A'),
  part('home-window-frame', 'box', [0.06, 0.85, 0.57], [0.35, 0.38, 0.08], C.woodDark),
  part('home-window-glass', 'box', [0.06, 0.85, 0.62], [0.26, 0.29, 0.04], '#F0C875'),
  part('home-window-mullion', 'box', [0.06, 0.85, 0.65], [0.025, 0.3, 0.025], C.wood),
  part('home-step', 'box', [-0.48, 0.07, 0.77], [0.52, 0.14, 0.28], C.stone),
  part('home-chimney', 'box', [0.16, 1.63, -0.38], [0.23, 0.67, 0.25], '#C7A680'),
  part('home-chimney-rim', 'box', [0.16, 1.98, -0.38], [0.3, 0.08, 0.31], C.plaster),
  part('home-chimney-opening', 'box', [0.16, 2.025, -0.38], [0.16, 0.015, 0.17], C.woodDark),
];
/** Upgrade attachments may change, but the original house is never replaced. */
export const houseCore = (): Part[] => [...shell(), ...roof(), ...door()];
