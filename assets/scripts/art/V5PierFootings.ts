import { part } from './AssetTypes';
import type { AssetRecipe } from './AssetTypes';
/** The base profile is >= -1.085. Natural-cliff rock is >= -1.3 - 2*.13 - 2*.07.
 * Every final bed is their convex combination, so -1.70 bounds the complete foot,
 * including between samples and both sides of a cliff. Extra burial is invisible.
 * Keep this proof synchronized with the v5 hydrology profile, never the water level. */
export const V5_PIER_BED_LOWER = -1.7;
export const V5_PIER_EMBED = 0.01;
export const V5_PIER_FOOT_TOP = -0.415; // 5 mm overlap with the unchanged -0.42 original bottom.
/** One stable mesh/material key, independent of building ID, seed, placement or rotation. */
export const V5_PIER_FOOT_UNIT: AssetRecipe = {
  id: 'v5-pier-foot-unit',
  footprint: [1, 1],
  parts: [
    {
      ...part('pier-foot-unit', 'log', [0, 0, 0], [1, 1, 1], '#E5BF93'),
      texture: 'warm-wood',
    },
  ],
};
export function v5PierFootings(simple: boolean, depth: number) {
  const bottom = V5_PIER_BED_LOWER - V5_PIER_EMBED,
    height = V5_PIER_FOOT_TOP - bottom,
    y = (V5_PIER_FOOT_TOP + bottom) / 2,
    radius = simple ? 0.49 : 0.48,
    width = simple ? 0.23 : 0.13,
    rows = simple ? [1.24, 2.72] : [depth / 2 + 0.4, depth / 2 + 1.8];
  return [-radius, radius].flatMap((x) => rows.map((z) => ({ x, y, z, width, height })));
}
