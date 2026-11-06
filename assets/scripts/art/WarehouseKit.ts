import { ART as C, part, move } from './AssetTypes';
import type { Part, AssetRecipe } from './AssetTypes';
import { houseCore, wood, shell, roof, door } from './BuildingCore';
import { woodenCrate } from './BuildingAccessories';
export { shell, roof, door };
/** Reassembled crate planks form an open loading porch, not a replacement house. */
export const deck = (): Part[] => [
  wood('loading-deck', [0.64, 0.22, -0.06], [0.64, 0.09, 1.22]),
  ...Array.from({ length: 6 }, (_, i) =>
    wood('crate-deck-slat', [0.64, 0.275, -0.56 + i * 0.2], [0.64, 0.025, 0.19]),
  ),
  ...[-1, 1].map((side) =>
    wood('crate-deck-post', [0.87, 0.13, -0.06 + side * 0.5], [0.12, 0.26, 0.12]),
  ),
  wood('loading-ramp', [0.64, 0.145, 0.72], [0.46, 0.065, 0.48], [27, 0, 0]),
];
export const wing = (): Part[] => [
  ...[-1, 1].map((side) =>
    wood('crate-canopy-post', [0.88, 0.64, -0.06 + side * 0.52], [0.1, 0.86, 0.1]),
  ),
  wood('crate-canopy-rail', [0.89, 1.06, -0.06], [0.13, 0.1, 1.28]),
  ...Array.from({ length: 6 }, (_, i) =>
    wood('crate-canopy-plank', [0.63, 1.12, -0.61 + i * 0.22], [0.68, 0.065, 0.21], [0, 0, -12]),
  ),
  ...[-1, 1].map((side) =>
    wood('crate-canopy-brace', [0.77, 0.93, -0.06 + side * 0.51], [0.32, 0.065, 0.07], [0, 0, -40]),
  ),
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
  const parts = [
    ...houseCore(),
    ...deck(),
    ...wing(),
    ...move(woodenCrate(), [0.63, 0.29, -0.36], 0.65),
    ...move(woodenCrate(), [0.63, 0.29, 0.08], 0.65),
  ];
  if (id === 'warehouse-expanded') {
    parts.push(...move(woodenCrate(), [0.63, 0.59, -0.36], 0.6));
    parts.push(wood('warehouse-reinforcement', [0.9, 0.58, -0.06], [0.055, 0.09, 1.1]));
  }
  if (id === 'warehouse-cold') parts.push(...move(cooling(), [0.63, 0.29, 0.08], 0.63));
  return {
    id,
    footprint: [2, 2],
    parts,
    sockets: { side: [0.61, 0, -0.08], front: [-0.25, 0, 0.74] },
  };
}
