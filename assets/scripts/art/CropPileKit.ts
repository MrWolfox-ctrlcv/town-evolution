import { riceProductUnit } from './RiceGeometry';
import type { Crop } from '../domain/types';
import { part } from './AssetTypes';
import type { AssetRecipe, Part, V3 } from './AssetTypes';
import { assetBounds } from './MeshCompiler';
/** One harvested good, not a planted crop: recognizable roots, heads, or tied wheat bundles. */
export function cropProductUnit(item: Crop): Part[] {
  if (item === 'rice') return riceProductUnit();
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
      part('lettuce-wrapper', 'crown', [0, -0.01, 0], [0.32, 0.15, 0.31], '#75973D'),
      ...Array.from({ length: 3 }, (_, i) => {
        const a = (i * Math.PI * 2) / 3;
        return part(
          'outer-leaf',
          'ribbon',
          [Math.cos(a) * 0.07, 0.01, Math.sin(a) * 0.07],
          [0.21, 0.18, 0.085],
          i % 2 ? '#90AD49' : '#75973D',
          [-15, 90 - i * 120, 0],
        );
      }),
    ];
  const wheat: Part[] = [];
  for (let i = 0; i < 7; i++) {
    const x = ((i % 3) - 1) * 0.047,
      y = Math.floor(i / 3) * 0.035;
    wheat.push(
      part('cut-straw', 'straw', [x, y, -0.065], [0.015, 0.48, 0.015], '#C89D40', [90, 0, 0]),
    );
    for (let tier = 0; tier < 2; tier++)
      for (const side of [-1, 1])
        wheat.push(
          part(
            'harvested-grain',
            'kernel',
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
/** Compact harvested heaps: supported layers overlap, rather than forming planted rows. */
export function cropProductPile(item: Crop, amount: number): AssetRecipe {
  const unit = cropProductUnit(item);
  const scale = item === 'lettuce' ? 0.63 : 0.94;
  const parts: Part[] = [];
  for (let i = 0; i < amount; i++) {
    // Four, three, two, one keeps all ten roots/sheaves recognizable in a low bundle.
    let layer = i < 4 ? 0 : i < 7 ? 1 : i < 9 ? 2 : 3;
    const start = [0, 4, 7, 9][layer]!;
    const count = Math.min(amount - start, 4 - layer);
    const slot = i - start;
    let x = (slot - (count - 1) / 2) * 0.16;
    let z = layer * -0.035 + (slot % 2 ? 0.018 : -0.018);
    if (item === 'lettuce') {
      // Keep the existing round-head layout; this correction concerns roots and sheaves.
      const row = Math.floor(i / 4),
        width = Math.min(4, amount - row * 4);
      x = ((i % 4) - (width - 1) / 2) * 0.24;
      z = (row - (Math.ceil(amount / 4) - 1) / 2) * 0.245;
      layer = 0;
    }
    const spread = (slot - (count - 1) / 2) * (item === 'vegetable' ? -12 : 12);
    const yaw = item === 'lettuce' ? 0 : spread + (layer % 2 ? -9 : 5);
    const angle = (yaw * Math.PI) / 180;
    const source = unit.map((p) => ({
      ...p,
      name: `unit-${i + 1}-${p.name}`,
      position: [
        (p.position[0] * Math.cos(angle) + p.position[2] * Math.sin(angle)) * scale,
        p.position[1] * scale,
        (-p.position[0] * Math.sin(angle) + p.position[2] * Math.cos(angle)) * scale,
      ] as V3,
      size: p.size.map((v) => v * scale) as unknown as V3,
      rotation: [p.rotation?.[0] ?? 0, (p.rotation?.[1] ?? 0) + yaw, p.rotation?.[2] ?? 0] as V3,
    }));
    const bounds = assetBounds({ id: item, footprint: [1, 1], parts: source });
    const rise = layer * (item === 'rice' ? 0.055 : item === 'wheat' ? 0.082 : 0.12);
    for (const p of source)
      parts.push({
        ...p,
        position: [
          p.position[0] + x,
          p.position[1] - bounds.min[1]! + rise,
          p.position[2] - (bounds.min[2]! + bounds.max[2]!) / 2 + z,
        ],
      });
  }
  return { id: `pile-${item}-${amount}`, footprint: [1, 1], parts };
}
