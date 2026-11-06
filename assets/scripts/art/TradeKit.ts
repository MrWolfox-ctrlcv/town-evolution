import { ART as C, part, move } from './AssetTypes';
import type { AssetRecipe, Part } from './AssetTypes';
import { houseCore, wood } from './BuildingCore';
import { woodenBoard, mount } from './BuildingAccessories';
import { crate } from './EnvironmentKit';
/** The house keeps its arched front door; the board mounts above a side-wall shop window. */
export function shop(): AssetRecipe {
  const parts = houseCore().filter(
    (p) =>
      !['side-window-frame', 'side-window', 'window-mullion-v', 'window-mullion-h'].includes(
        p.name,
      ),
  );
  parts.push(part('sales-opening', 'box', [0.359, 0.72, -0.08], [0.04, 0.61, 0.86], '#4F3927'));
  parts.push(wood('sales-counter', [0.6, 0.46, -0.08], [0.52, 0.1, 1.02]));
  for (const side of [-1, 1])
    parts.push(
      wood('counter-bracket', [0.51, 0.32, -0.08 + side * 0.38], [0.28, 0.07, 0.07], [0, 0, 38]),
    );
  for (let i = 0; i < 5; i++) {
    const color = i % 2 ? '#FFF0CE' : '#E88A3C';
    const z = -0.08 + (i - 2) * 0.205;
    parts.push(
      part('awning-stripe', 'box', [0.62, 1.08, z], [0.64, 0.05, 0.2], color, [0, 0, -15]),
    );
    parts.push(part('awning-fringe', 'box', [0.927, 0.98, z], [0.04, 0.13, 0.2], color));
  }
  parts.push(...mount(woodenBoard(), [0.42, 0.73, -0.08], 90, 0.92));
  for (const side of [-1, 1]) {
    parts.push(...move(crate(), [0.6, 0.51, -0.08 + side * 0.245], 0.47));
    for (let i = 0; i < 4; i++)
      parts.push(
        part(
          'market-produce',
          'gem',
          [0.58 + (i % 2) * 0.09, 0.73, -0.08 + side * 0.245 + (i < 2 ? -0.05 : 0.05)],
          [0.11, 0.11, 0.11],
          side < 0 ? '#D5B536' : '#C85C35',
        ),
      );
  }
  return { id: 'shop', footprint: [2, 2], parts, sockets: { counter: [0.6, 0.55, -0.08] } };
}
/** This exact wooden assembly is reused as the shop's sign, with its twin planks and pins. */
export function orderBoard(): AssetRecipe {
  return { id: 'order-board', footprint: [1, 1], parts: woodenBoard() };
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
