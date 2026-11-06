import { part, move } from './AssetTypes';
import type { AssetRecipe, Part } from './AssetTypes';
import { houseCore, wood } from './BuildingCore';

/** Two stacked circular grindstones and a raised hand crank remain the same component. */
export function stoneMillParts(): Part[] {
  const parts: Part[] = [
    wood('mill-platform', [0, 0.1, 0], [0.82, 0.16, 0.78]),
    part('mill-lower-stone', 'log', [0, 0.26, 0], [0.7, 0.18, 0.7], '#B4B0A4'),
    part('mill-upper-stone', 'log', [0, 0.43, 0], [0.66, 0.16, 0.66], '#CCC6B7'),
    part('mill-grinding-gap', 'log', [0, 0.35, 0], [0.67, 0.018, 0.67], '#88877F'),
    part('mill-center-spindle', 'log', [0, 0.53, 0], [0.08, 0.09, 0.08], '#666861'),
    wood('mill-crank-arm', [0.145, 0.55, 0], [0.37, 0.045, 0.05]),
    wood('mill-crank-handle', [0.3, 0.66, 0], [0.07, 0.24, 0.07]),
    part('mill-grain-hole', 'log', [-0.12, 0.514, -0.05], [0.095, 0.006, 0.095], '#77756B'),
    wood('mill-flour-chute', [0, 0.26, 0.35], [0.17, 0.055, 0.21], [12, 0, 0]),
  ];
  for (const x of [-0.37, 0.37])
    for (const z of [-0.34, 0.34])
      parts.push(wood('mill-platform-post', [x, 0.15, z], [0.09, 0.3, 0.09]));
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    parts.push(
      part(
        'mill-stone-cut',
        'box',
        [Math.sin(angle) * 0.21, 0.514, Math.cos(angle) * 0.21],
        [0.009, 0.006, 0.18],
        '#A29D92',
        [0, i * 45, 0],
      ),
    );
  }
  return parts;
}

export function stoneMill(): AssetRecipe {
  return { id: 'stone-mill', footprint: [1, 1], parts: stoneMillParts() };
}

/** The established house stays intact; a low side shelter exposes the reused stone mill. */
export function mill(): AssetRecipe {
  const parts = houseCore();
  parts.push(
    wood('mill-side-deck', [0.65, 0.08, 0.05], [0.66, 0.16, 1.25]),
    ...move(stoneMillParts(), [0.66, 0.16, 0.22], 0.65),
    wood('mill-shelter-roof', [0.65, 1.16, 0.02], [0.68, 0.09, 1.3], [0, 0, -7]),
    wood('mill-shelter-front-beam', [0.65, 1.06, 0.61], [0.68, 0.09, 0.09]),
  );
  for (const z of [-0.55, 0.6])
    parts.push(wood('mill-shelter-post', [0.92, 0.63, z], [0.09, 1.15, 0.09]));
  for (const z of [-0.48, -0.24, 0, 0.24, 0.48])
    parts.push(wood('mill-shelter-roof-plank', [0.65, 1.214, z], [0.68, 0.014, 0.025], [0, 0, -7]));
  return { id: 'mill', footprint: [2, 2], parts };
}

/** The open bags distinguish white rice grains from smooth pale flour without UI labels. */
export function grainProductUnit(item: 'milledRice' | 'flour'): Part[] {
  const rice = item === 'milledRice';
  const parts: Part[] = [
    part('grain-sack', 'crown', [0, 0.13, 0], [0.26, 0.27, 0.26], rice ? '#BDA376' : '#D7C9A3'),
    part('grain-sack-rim', 'binding', [0, 0.247, 0], [0.22, 0.055, 0.22], '#9B8258'),
    part(
      'grain-sack-fill',
      'log',
      [0, 0.254, 0],
      [0.18, 0.028, 0.18],
      rice ? '#EEE8CE' : '#F6EDD7',
    ),
  ];
  if (rice)
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.399;
      const radius = i === 0 ? 0 : 0.045;
      parts.push(
        part(
          'milled-rice-grain',
          'kernel',
          [Math.cos(angle) * radius, 0.279, Math.sin(angle) * radius],
          [0.018, 0.045, 0.015],
          '#FFF5DA',
          [90, i * 47, 0],
        ),
      );
    }
  else parts.push(part('flour-mound', 'crown', [0, 0.274, 0], [0.17, 0.055, 0.17], '#FFF4DA'));
  return parts;
}
