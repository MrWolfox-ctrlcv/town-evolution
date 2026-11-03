import { ART as C, part, move } from './AssetTypes';
import type { AssetRecipe, Part } from './AssetTypes';
import { shell, roof, deck } from './WarehouseKit';
import { crate } from './EnvironmentKit';
/** Shared house core with a broad striped sales canopy instead of warehouse doors. */
export function shop(): AssetRecipe {
  const parts = [...shell(), ...roof(), ...deck()];
  parts.push(part('sales-opening', 'box', [-0.25, 0.76, 0.55], [0.88, 0.56, 0.04], C.woodDark));
  parts.push(part('sales-counter', 'box', [-0.25, 0.49, 0.71], [1.05, 0.12, 0.3], C.woodLight));
  for (const s of [-1, 1])
    parts.push(
      part('counter-leg', 'box', [-0.25 + s * 0.43, 0.36, 0.71], [0.08, 0.28, 0.08], C.wood),
    );
  for (let i = 0; i < 5; i++) {
    const color = i % 2 ? C.plaster : C.teal;
    parts.push(
      part(
        'awning-stripe',
        'box',
        [-0.25 + (i - 2) * 0.23, 1.13, 0.71],
        [0.23, 0.055, 0.46],
        color,
        [15, 0, 0],
      ),
    );
    parts.push(
      part(
        'awning-fringe',
        'box',
        [-0.25 + (i - 2) * 0.23, 1.02, 0.93],
        [0.23, 0.13, 0.035],
        color,
      ),
    );
  }
  parts.push(...move(crate(), [0.61, 0, 0.12], 0.85));
  return { id: 'shop', footprint: [2, 2], parts, sockets: { counter: [-0.25, 0.55, 0.71] } };
}
/** Narrow roofed notice board: exposed legs and pale papers distinguish it at zoom-out. */
export function orderBoard(): AssetRecipe {
  const parts: Part[] = [];
  for (const s of [-1, 1]) {
    parts.push(part('board-foot', 'box', [s * 0.34, 0.075, 0], [0.2, 0.15, 0.42], C.stone));
    parts.push(part('board-post', 'box', [s * 0.34, 0.63, 0], [0.1, 1.1, 0.12], C.wood));
  }
  parts.push(part('notice-panel', 'box', [0, 0.82, 0], [0.68, 0.62, 0.1], C.woodDark));
  for (const s of [-1, 1])
    parts.push(
      part('notice-rail', 'box', [0, 0.82 + s * 0.31, 0.03], [0.8, 0.07, 0.16], C.woodLight),
    );
  for (const i of [-1, 0, 1]) {
    parts.push(
      part(
        'paper',
        'box',
        [i * 0.21, 0.82 - Math.abs(i) * 0.025, 0.065],
        [0.17, 0.39, 0.025],
        C.plaster,
      ),
    );
    parts.push(
      part(
        'paper-pin',
        'gem',
        [i * 0.21, 0.98 - Math.abs(i) * 0.025, 0.085],
        [0.035, 0.035, 0.02],
        C.wood,
      ),
    );
  }
  parts.push(part('board-gable', 'gable', [0, 1.3, 0], [0.93, 0.25, 0.46], C.roof));
  parts.push(part('board-ridge', 'box', [0, 1.43, 0], [0.06, 0.04, 0.48], C.roofDark));
  return { id: 'order-board', footprint: [1, 1], parts };
}
/** On-grid cargo staging quay; no new water terrain or off-grid collision semantics. */
export function dock(): AssetRecipe {
  const parts: Part[] = [part('quay-base', 'box', [0, 0.09, 0], [1.9, 0.18, 1.9], C.stone)];
  for (let i = 0; i < 7; i++)
    parts.push(
      part(
        'deck-plank',
        'box',
        [0, 0.23, (i - 3) * 0.255],
        [1.88, 0.12, 0.245],
        i % 2 ? C.wood : C.woodLight,
      ),
    );
  for (const x of [-0.79, 0.79])
    for (const z of [-0.79, 0.79]) {
      parts.push(part('bollard', 'box', [x, 0.4, z], [0.16, 0.6, 0.16], C.woodDark));
      parts.push(part('rope-band', 'box', [x, 0.55, z], [0.19, 0.09, 0.19], C.plaster));
    }
  parts.push(part('dispatch-kiosk', 'box', [-0.37, 0.68, -0.45], [0.72, 0.78, 0.66], C.plaster));
  parts.push(part('kiosk-roof', 'gable', [-0.37, 1.23, -0.45], [0.88, 0.3, 0.84], C.roof));
  parts.push(part('dispatch-window', 'box', [-0.37, 0.8, -0.108], [0.49, 0.3, 0.035], C.teal));
  parts.push(part('dispatch-sill', 'box', [-0.37, 0.64, -0.07], [0.57, 0.055, 0.16], C.woodLight));
  parts.push(...move(crate(), [0.42, 0.29, -0.24], 0.92));
  parts.push(...move(crate(), [0.42, 0.29, 0.24], 0.92));
  parts.push(...move(crate(), [0.42, 0.695, -0.12], 0.72));
  return {
    id: 'dock',
    footprint: [2, 2],
    parts,
    sockets: { cargo: [0.42, 0.29, 0], dispatch: [-0.37, 0.29, -0.45] },
  };
}
