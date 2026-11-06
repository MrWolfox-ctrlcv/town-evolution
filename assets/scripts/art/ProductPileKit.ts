import { roastedCarrotPile, roastedCarrotProductUnit } from './BarrelRoastKit';
import { saplingProductUnit } from './NurseryKit';
import { grainProductUnit } from './RiceMillKit';
import { breadProductUnit } from './BakeryKit';
import { isCrop } from '../domain/crops';
import { cropProductUnit, cropProductPile } from './CropPileKit';
import { stackLimitFor } from '../domain/foundation';
import { part } from './AssetTypes';
import type { AssetRecipe, Part, V3 } from './AssetTypes';
import { compileAsset } from './MeshCompiler';
export const PRODUCTS = [
  'wood',
  'stone',
  'soil',
  'mud',
  'treeSeed',
  'wheat',
  'vegetable',
  'lettuce',
  'chilledVegetable',
  'rice',
  'sapling',
  'milledRice',
  'flour',
  'bread',
  'roastedCarrot',
] as const;
export type Product = (typeof PRODUCTS)[number];

/** Harvested goods have their own silhouettes; never reuse a growing crop cell. */
function unit(item: Product): Part[] {
  if (item === 'roastedCarrot') return roastedCarrotProductUnit();
  if (item === 'sapling') return saplingProductUnit();
  if (item === 'milledRice' || item === 'flour') return grainProductUnit(item);
  if (item === 'bread') return breadProductUnit();
  if (item === 'wood')
    return [
      part('bark', 'log', [0, 0, 0], [0.23, 0.72, 0.25], '#885630', [90, 0, 0]),
      ...[-1, 1].flatMap((s) => [
        part('cut-end', 'log', [0, 0, s * 0.362], [0.21, 0.012, 0.23], '#DBB57C', [s * 90, 0, 0]),
        part('heartwood', 'timber', [0, 0, s * 0.37], [0.07, 0.014, 0.07], '#B68751', [
          s * 90,
          0,
          0,
        ]),
      ]),
    ];
  if (item === 'stone')
    return [
      part('boulder', 'crown', [0, 0, 0], [0.32, 0.24, 0.37], '#96938A', [7, 24, 14]),
      part('broken-face', 'gem', [0.07, 0.07, 0.02], [0.18, 0.15, 0.23], '#B6AEA0', [0, 18, 0]),
    ];
  if (item === 'soil')
    return [
      part('earth-clod', 'box', [0, 0, 0], [0.28, 0.22, 0.3], '#B77B4B', [4, 17, 3]),
      part('crumb', 'gem', [0.09, 0.09, 0.03], [0.19, 0.14, 0.18], '#D39A62', [0, 20, 0]),
    ];
  if (item === 'mud')
    return [
      part('wet-clay', 'box', [0, 0, 0], [0.282, 0.14, 0.282], '#765340'),
      part('pressed-top', 'box', [0, 0.078, 0], [0.268, 0.024, 0.268], '#89644C'),
      part(
        'wet-sheen',
        'gem',
        [0.035, 0.091, -0.028],
        [0.105, 0.012, 0.066],
        '#AAA08A',
        [0, 22, 0],
      ),
      part('damp-edge', 'box', [0.142, -0.008, 0.025], [0.004, 0.06, 0.092], '#654A3B'),
    ];
  if (item === 'treeSeed')
    return [
      part('acorn-seed', 'crown', [0, 0, 0], [0.2, 0.25, 0.2], '#B98B4C', [0, 13, 18]),
      part('acorn-cap', 'crown', [-0.03, 0.1, 0], [0.22, 0.11, 0.22], '#76573D', [0, 13, 18]),
      part('acorn-stem', 'timber', [-0.04, 0.17, 0], [0.035, 0.08, 0.035], '#826342', [0, 0, 18]),
    ];
  if (item === 'chilledVegetable')
    return [
      part('insulated-case', 'box', [0, 0.1, 0], [0.27, 0.2, 0.32], '#8EAFAA'),
      part('lid', 'box', [0, 0.21, 0], [0.29, 0.035, 0.34], '#DAE7D8'),
      part('cold-band', 'box', [0, 0.115, 0.163], [0.07, 0.19, 0.008], '#477F84'),
    ];
  return cropProductUnit(item);
}

/** Each physical item is one visible unit; nine clay blocks complete one low land-shaped pad. */
export function productPile(item: Product, amount: number): AssetRecipe {
  if (!Number.isInteger(amount) || amount < 1 || amount > stackLimitFor(item))
    throw new RangeError(`Invalid ${item} pile amount: ${amount}`);
  if (item === 'roastedCarrot') return roastedCarrotPile(amount);
  if (isCrop(item)) return cropProductPile(item, amount);
  const parts: Part[] = [];
  for (let i = 0; i < amount; i++) {
    const mud = item === 'mud';
    const pyramid = item === 'wood' || item === 'stone';
    const row = mud ? Math.floor(i / 3) : pyramid && i >= 5 ? 2 : i >= 3 ? 1 : 0;
    const count = mud
      ? Math.min(amount - row * 3, 3)
      : row === 2
        ? 1
        : row === 1
          ? Math.min(amount - 3, pyramid ? 2 : 3)
          : Math.min(amount, 3);
    const slot = mud ? i % 3 : row === 2 ? 0 : row === 1 ? i - 3 : i;
    let x = (slot - (count - 1) / 2) * (mud ? 0.292 : item === 'wood' ? 0.23 : 0.27);
    let z = item === 'wood' ? (i % 2) * 0.025 : row ? 0.16 : amount > 3 ? -0.14 : 0;
    if (mud) z = (row - (Math.ceil(amount / 3) - 1) / 2) * 0.292;
    if (item === 'soil' && amount > 1) {
      const a = (i * Math.PI * 2) / Math.min(amount, 3);
      const radius = amount === 2 ? 0.14 : 0.18;
      x = Math.cos(a) * radius;
      z = Math.sin(a) * radius;
    }
    if (item === 'stone') z = (i % 2) * 0.045;
    const yaw = item === 'wood' || mud ? 0 : ((i % 3) - 1) * 17;
    const angle = (yaw * Math.PI) / 180;
    const source = unit(item).map((p) => ({
      ...p,
      name: `unit-${i + 1}-${p.name}`,
      position: [
        p.position[0] * Math.cos(angle) + p.position[2] * Math.sin(angle),
        p.position[1],
        -p.position[0] * Math.sin(angle) + p.position[2] * Math.cos(angle),
      ] as V3,
      rotation: [p.rotation?.[0] ?? 0, (p.rotation?.[1] ?? 0) + yaw, p.rotation?.[2] ?? 0] as V3,
    }));
    const bounds = compileAsset({ id: 'unit', footprint: [1, 1], parts: source });
    const rise =
      item === 'wood'
        ? row * 0.199
        : item === 'stone' || item === 'soil'
          ? row * (item === 'stone' ? 0.18 : 0.15)
          : 0;
    for (const p of source)
      parts.push({
        ...p,
        position: [p.position[0] + x, p.position[1] - bounds.min[1]! + rise, p.position[2] + z],
      });
    // Tiny green patches on the completed pad suggest usable land, without labels or a badge.
    if (mud && amount === 9 && [0, 2, 6, 8].includes(i)) {
      const edgeX = x + (i % 3 === 0 ? -0.07 : 0.07);
      const edgeZ = z + (row === 0 ? -0.065 : 0.065);
      parts.push(
        part(
          `unit-${i + 1}-land-moss`,
          'box',
          [edgeX, 0.166, edgeZ],
          [0.12, 0.014, 0.1],
          '#8A9D4E',
        ),
        part(
          `unit-${i + 1}-land-fleck`,
          'box',
          [edgeX + 0.035, 0.176, edgeZ - 0.025],
          [0.055, 0.012, 0.045],
          '#ACBC64',
        ),
      );
    }
  }
  if (item === 'wood' && amount > 1) {
    const bounds = compileAsset({ id: 'logs', footprint: [1, 1], parts });
    parts.push(
      part(
        'unit-1-bundle-twine',
        'binding',
        [0, bounds.max[1]! / 2, 0.04],
        [(bounds.max[0]! - bounds.min[0]!) * 1.03, bounds.max[1]!, 0.026],
        '#D8BD80',
      ),
    );
  }
  return { id: `pile-${item}-${amount}`, footprint: [1, 1], parts };
}
