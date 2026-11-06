import { ART as C, part } from './AssetTypes';
import type { AssetRecipe } from './AssetTypes';
import { houseCore } from './BuildingCore';
/** The unmodified core used by both crate and notice-board building upgrades. */
export function house(): AssetRecipe {
  return {
    id: 'house',
    footprint: [2, 2],
    parts: houseCore(),
    sockets: { side: [0.61, 0, -0.08], front: [-0.25, 0, 0.74] },
  };
}

/** A finished clay-plastered home keeps the original shell, roof and occupied footprint. */
export function residence(): AssetRecipe {
  const base = house();
  return {
    ...base,
    id: 'residence',
    parts: [
      ...base.parts.map((p) => {
        if (p.name === 'cream-walls' || p.name === 'gable-wall') return { ...p, color: '#F3E5C8' };
        if (p.name === 'side-window') return { ...p, color: '#F0C875' };
        if (p.name === 'home-door') return { ...p, color: '#A87946' };
        if (p.name === 'home-chimney') return { ...p, color: '#E2CBA5' };
        return p;
      }),
      part('residence-plaster-plinth', 'box', [-0.25, 0.25, 0.554], [1.08, 0.12, 0.035], '#DBCAA7'),
      part('residence-side-plinth', 'box', [0.32, 0.25, -0.08], [0.035, 0.12, 1.2], '#DBCAA7'),
      part('residence-window-crossbar', 'box', [0.06, 0.85, 0.651], [0.27, 0.025, 0.025], C.wood),
      ...[-1, 1].map((side) =>
        part(
          'residence-front-shutter',
          'box',
          [0.06 + side * 0.205, 0.85, 0.6],
          [0.1, 0.34, 0.055],
          '#6F8A59',
        ),
      ),
      ...[-1, 1].map((side) =>
        part(
          'residence-side-shutter',
          'box',
          [0.36, 0.84, -0.06 + side * 0.205],
          [0.055, 0.3, 0.1],
          '#6F8A59',
        ),
      ),
      part('residence-window-box', 'box', [0.06, 0.61, 0.65], [0.49, 0.105, 0.15], C.wood),
      part(
        'residence-window-box-soil',
        'box',
        [0.06, 0.665, 0.65],
        [0.43, 0.018, 0.11],
        C.soilDark,
      ),
      ...[-1, 0, 1].flatMap((i) => [
        part(
          'residence-window-leaves',
          'crown',
          [0.06 + i * 0.14, 0.705, 0.66],
          [0.17, 0.11, 0.14],
          i ? C.leaf : C.leafLight,
        ),
        part(
          'residence-window-flower',
          'box',
          [0.06 + i * 0.14, 0.77, 0.675],
          [0.052, 0.045, 0.05],
          i ? '#E6AD72' : '#E4BEA6',
        ),
      ]),
      part(
        'residence-gable-plaster',
        'gable',
        [-0.25, 1.405, 0.658],
        [1.14, 0.38, 0.025],
        '#F3E5C8',
      ),
      part('residence-attic-frame', 'box', [-0.25, 1.39, 0.685], [0.18, 0.19, 0.045], C.woodDark),
      part('residence-attic-glass', 'box', [-0.25, 1.39, 0.712], [0.115, 0.125, 0.02], '#F4CE7D'),
      part('residence-attic-mullion', 'box', [-0.25, 1.39, 0.727], [0.018, 0.13, 0.015], C.wood),
      part('residence-door-lintel', 'box', [-0.48, 1.055, 0.62], [0.46, 0.075, 0.14], C.wood),
      part('residence-door-pane', 'box', [-0.48, 0.83, 0.653], [0.13, 0.16, 0.018], '#F4CE7D'),
      part(
        'residence-door-pane-bar',
        'box',
        [-0.48, 0.83, 0.668],
        [0.018, 0.17, 0.012],
        C.woodDark,
      ),
    ],
  };
}
