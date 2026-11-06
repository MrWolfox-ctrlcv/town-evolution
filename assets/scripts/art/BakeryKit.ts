import { ART as C, part } from './AssetTypes';
import type { AssetRecipe, Part, V3 } from './AssetTypes';
import { houseCore, wood } from './BuildingCore';
import { mount } from './BuildingAccessories';

/** Shared mesh assembly: the standalone oven remains recognizable after the house upgrade. */
export function stoneOvenParts(): Part[] {
  const parts: Part[] = [
    part('oven-foundation', 'box', [0, 0.055, 0], [0.84, 0.11, 0.8], '#B9AE98'),
    part('oven-store-back', 'box', [0, 0.27, -0.29], [0.78, 0.33, 0.14], '#B6AA93'),
    part('oven-hearth', 'box', [0, 0.485, 0.01], [0.88, 0.12, 0.82], '#D5C6A8'),
    part('oven-dome', 'crown', [0, 0.78, -0.06], [0.8, 0.65, 0.66], '#D8CCB6'),
    part('oven-mouth-dark', 'crown', [0, 0.735, 0.274], [0.49, 0.41, 0.025], '#302923'),
    part('oven-baking-floor', 'box', [0, 0.558, 0.275], [0.47, 0.025, 0.24], '#72513A'),
    part('oven-embers', 'crown', [0, 0.59, 0.294], [0.33, 0.045, 0.13], '#E77728'),
    part('oven-chimney', 'box', [0, 1.235, -0.17], [0.23, 0.4, 0.24], '#B8AF9E'),
    part('oven-chimney-rim', 'box', [0, 1.47, -0.17], [0.32, 0.075, 0.33], '#D6CAB6'),
    part('oven-chimney-opening', 'box', [0, 1.511, -0.17], [0.19, 0.012, 0.2], '#51473C'),
  ];
  for (const side of [-1, 1])
    for (const row of [0, 1]) {
      parts.push(
        part(
          'oven-store-pier',
          'box',
          [side * 0.315, 0.19 + row * 0.16, 0.13],
          [0.18, 0.15, 0.51],
          row ? '#C8BDA7' : '#B7AD99',
        ),
      );
    }
  // Seven separate voussoirs frame an unobscured, inset fire opening, rather than a painted badge.
  for (let i = 0; i < 7; i++) {
    const angle = (i * Math.PI) / 6;
    parts.push(
      part(
        'oven-arch-stone',
        'box',
        [Math.cos(angle) * 0.285, 0.68 + Math.sin(angle) * 0.285, 0.315],
        [0.155, 0.18, 0.19],
        i % 2 ? '#D1C4AA' : '#E1D3B8',
        [0, 0, i * 30],
      ),
    );
  }
  for (const row of [0, 1, 2])
    parts.push(
      part(
        'oven-chimney-course',
        'box',
        [row % 2 ? 0.035 : -0.035, 1.09 + row * 0.125, -0.043],
        [0.15, 0.109, 0.018],
        row % 2 ? '#C9BEAA' : '#A89E8C',
      ),
    );
  for (const [index, x] of [-0.115, 0, 0.115].entries()) {
    const y = index === 1 ? 0.265 : 0.185;
    parts.push(
      part('oven-stored-log', 'log', [x, y, 0.13], [0.13, 0.46, 0.13], '#885D3D', [90, 0, 0]),
      part('oven-log-cut', 'log', [x, y, 0.365], [0.112, 0.012, 0.112], '#DAB47B', [90, 0, 0]),
      part(
        'oven-fire-flame',
        'gem',
        [x * 0.75, 0.67 + (index === 1 ? 0.025 : 0), 0.302],
        [0.09, index === 1 ? 0.22 : 0.15, 0.065],
        index === 1 ? '#FFD66E' : '#F6A03E',
        [0, 0, index === 1 ? 0 : (index - 1) * 14],
      ),
    );
  }
  return parts;
}

export function stoneOven(): AssetRecipe {
  return { id: 'stone-oven', footprint: [1, 1], category: 'buildings', parts: stoneOvenParts() };
}

/** A single countable loaf, shared by the bakery counter and future ground product piles. */
export function breadProductUnit(): Part[] {
  return [
    part('bread-crust-base', 'crown', [0, 0.03, 0], [0.27, 0.05, 0.17], '#B87932'),
    part('bread-loaf', 'crown', [0, 0.1, 0], [0.36, 0.2, 0.23], '#E8AC52'),
    ...[-1, 0, 1].map((index) =>
      part(
        'bread-score',
        'box',
        [index * 0.075, index ? 0.178 : 0.198, 0],
        [0.018, 0.009, 0.105],
        '#F8DB98',
        [0, -24, index * -16],
      ),
    ),
  ];
}

export const BAKERY_OVEN_POSITION: V3 = [0.62, 0, 0.17];
export const BAKERY_OVEN_SCALE = 0.8;

function bakeryShelter(): Part[] {
  const parts: Part[] = [
    wood('bakery-shelter-rear-post', [0.945, 0.46, -0.49], [0.07, 0.92, 0.07]),
    wood('bakery-shelter-front-post', [0.945, 0.46, 0.63], [0.07, 0.92, 0.07]),
    wood('bakery-shelter-front-beam', [0.64, 0.966, 0.63], [0.69, 0.065, 0.075], [0, 0, -10]),
    wood('bakery-shelter-side-beam', [0.945, 0.905, 0.065], [0.065, 0.07, 1.19]),
  ];
  // A clay-tile lean-to leaves the existing terracotta house roof completely unchanged.
  for (let column = 0; column < 2; column++)
    for (let row = 0; row < 4; row++) {
      const x = 0.47 + column * 0.32;
      parts.push(
        part(
          'bakery-shelter-roof-tile',
          'box',
          [x, 1.04 - (x - 0.64) * Math.tan(Math.PI / 18), -0.43 + row * 0.31],
          [0.335, 0.055, 0.325],
          (column + row) % 3 ? C.roof : '#E58A50',
          [0, 0, -10],
        ),
      );
    }
  return parts;
}

function bakeryCounter(): Part[] {
  const parts: Part[] = [
    wood('bakery-counter-top', [0.055, 0.395, 0.805], [0.46, 0.065, 0.27]),
    wood('bakery-counter-front', [0.055, 0.31, 0.925], [0.43, 0.11, 0.04]),
  ];
  for (const side of [-1, 1])
    for (const front of [-1, 1])
      parts.push(
        wood(
          'bakery-counter-leg',
          [0.055 + side * 0.175, 0.185, 0.805 + front * 0.09],
          [0.05, 0.37, 0.05],
        ),
      );
  for (let i = 0; i < 3; i++)
    parts.push(...mount(breadProductUnit(), [-0.095 + i * 0.15, 0.4275, 0.805], 0, 0.36));
  return parts;
}

/** The original house and the exact standalone oven assembly survive the upgrade. */
export function bakery(): AssetRecipe {
  return {
    id: 'bakery',
    footprint: [2, 2],
    category: 'buildings',
    parts: [
      ...houseCore(),
      ...mount(stoneOvenParts(), BAKERY_OVEN_POSITION, 0, BAKERY_OVEN_SCALE),
      ...bakeryShelter(),
      ...bakeryCounter(),
    ],
    sockets: { oven: BAKERY_OVEN_POSITION, counter: [0.055, 0.4275, 0.805] },
  };
}
