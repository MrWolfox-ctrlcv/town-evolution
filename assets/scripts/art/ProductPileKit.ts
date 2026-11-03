import { part } from './AssetTypes';
import type { AssetRecipe, Part, V3 } from './AssetTypes';
import { compileAsset } from './MeshCompiler';
export const PRODUCTS = [
  'wood',
  'stone',
  'wheat',
  'vegetable',
  'lettuce',
  'chilledVegetable',
] as const;
export type Product = (typeof PRODUCTS)[number];

/** Harvested goods have their own silhouettes; never reuse a growing crop cell. */
function unit(item: Product): Part[] {
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
  if (item === 'vegetable')
    return [
      part('carrot-root', 'root', [0, 0, -0.04], [0.17, 0.46, 0.17], '#E9953C', [90, 0, 0]),

      ...[-1, 0, 1].map((s) =>
        part(
          'cut-leaves',
          'frond',
          [s * 0.025, 0.025, 0.21],
          [0.095, 0.24, 0.06],
          s ? '#618B3C' : '#89A844',
          [70, s * 22, 0],
        ),
      ),
    ];
  if (item === 'lettuce')
    return [
      part('lettuce-heart', 'crown', [0, 0.04, 0], [0.24, 0.23, 0.23], '#B5CB61'),
      ...Array.from({ length: 3 }, (_, i) => {
        const a = (i * Math.PI * 2) / 3;
        return part(
          'outer-leaf',
          'crown',
          [Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07],
          [0.2, 0.17, 0.2],
          i % 2 ? '#90AD49' : '#75973D',
          [0, i * 120, 15],
        );
      }),
    ];
  if (item === 'chilledVegetable')
    return [
      part('insulated-case', 'box', [0, 0.1, 0], [0.27, 0.2, 0.32], '#8EAFAA'),
      part('lid', 'box', [0, 0.21, 0], [0.29, 0.035, 0.34], '#DAE7D8'),
      part('cold-band', 'box', [0, 0.115, 0.163], [0.07, 0.19, 0.008], '#477F84'),
    ];
  const wheat: Part[] = [];
  for (let i = 0; i < 7; i++) {
    const x = ((i % 3) - 1) * 0.047,
      y = Math.floor(i / 3) * 0.035;
    wheat.push(
      part('cut-straw', 'timber', [x, y, -0.065], [0.015, 0.48, 0.015], '#C89D40', [90, 0, 0]),
    );
    for (let tier = 0; tier < 2; tier++)
      for (const side of [-1, 1])
        wheat.push(
          part(
            'harvested-grain',
            'grain',
            [x + side * 0.02, y + 0.01, 0.16 + tier * 0.04],
            [0.044, 0.09, 0.04],
            i % 2 ? '#E7C765' : '#D6AE49',
            [80, side * 24, 0],
          ),
        );
  }
  wheat.push(part('twine', 'binding', [0, 0.035, -0.04], [0.135, 0.1, 0.022], '#C6AE7B'));
  return wheat;
}

/** Each loose unit rests on the surface; logs use a supported three-plus-two stack. */
export function productPile(item: Product, amount: number): AssetRecipe {
  const parts: Part[] = [];
  for (let i = 0; i < amount; i++) {
    const row = i >= 3 ? 1 : 0;
    const count = row ? amount - 3 : Math.min(amount, 3);
    const slot = row ? i - 3 : i;
    let x = (slot - (count - 1) / 2) * (item === 'wood' ? 0.23 : 0.27);
    let z = item === 'wood' ? (i % 2) * 0.025 : row ? 0.16 : amount > 3 ? -0.14 : 0;
    if ((item === 'stone' || item === 'lettuce') && amount > 1) {
      const a = (i * Math.PI * 2) / Math.min(amount, 3);
      const radius = amount === 2 ? 0.14 : 0.18;
      x = Math.cos(a) * radius;
      z = Math.sin(a) * radius;
    }
    const yaw = item === 'wood' ? 0 : ((i % 3) - 1) * 17;
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
      item === 'wood' ? row * 0.199 : item === 'stone' || item === 'lettuce' ? row * 0.15 : 0;
    for (const p of source)
      parts.push({
        ...p,
        position: [p.position[0] + x, p.position[1] - bounds.min[1]! + rise, p.position[2] + z],
      });
  }
  return { id: `pile-${item}-${amount}`, footprint: [1, 1], parts };
}
