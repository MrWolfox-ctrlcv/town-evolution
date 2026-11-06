import { part } from './AssetTypes';
import type { Part, V3 } from './AssetTypes';
import type { PlantStage } from './CropGeometry';

function stalk(name: string, a: V3, b: V3, width: number, color: string): Part {
  const d = b.map((v, i) => v - a[i]!);
  const length = Math.hypot(...d);
  return part(
    name,
    'straw',
    a.map((v, i) => (v + b[i]!) / 2) as unknown as V3,
    [width, length, width],
    color,
    [(Math.asin(d[2]! / length) * 180) / Math.PI, 0, (-Math.atan2(d[0]!, d[1]!) * 180) / Math.PI],
  );
}

/** Rice grows in clumps and bends under loose golden panicles, unlike upright wheat ears. */
export function riceGeometry(stage: PlantStage): Part[] {
  const parts: Part[] = [];
  const ready = stage === 'ready';
  const young = stage === 'young';
  const tillers = ready ? 4 : young ? 3 : 2;
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      for (let tiller = 0; tiller < tillers; tiller++) {
        const index = (row * 3 + col) * 4 + tiller;
        const angle = index * 2.399;
        const dx = Math.cos(angle),
          dz = Math.sin(angle);
        const x = (col - 1) * 0.19 + dx * 0.018;
        const z = (row - 1) * 0.19 + dz * 0.018;
        const height = (ready ? 0.56 : young ? 0.4 : 0.25) + (index % 4) * 0.012;
        const tip: V3 = [x + dx * 0.024, height, z + dz * 0.024];
        parts.push(stalk('rice-stem', [x, 0.17, z], tip, 0.006, ready ? '#A7A04C' : '#6B9D40'));
        for (let leaf = 0; leaf < 2; leaf++)
          parts.push(
            part(
              'rice-narrow-leaf',
              'cerealLeaf',
              [x, ready ? 0.29 : young ? 0.24 : 0.19, z],
              [ready ? 0.028 : young ? 0.023 : 0.015, ready ? 0.31 : young ? 0.23 : 0.115, 0.04],
              leaf ? '#95B84E' : '#6E9D43',
              [28, (angle * 180) / Math.PI + leaf * 150, 0],
            ),
          );
        if (!ready) continue;
        const bend: V3 = [tip[0] + dx * 0.035, height + 0.065, tip[2] + dz * 0.035];
        const end: V3 = [bend[0] + dx * 0.07, height - 0.035, bend[2] + dz * 0.07];
        parts.push(stalk('rice-panicle-rise', tip, bend, 0.005, '#C8B45A'));
        parts.push(stalk('rice-drooping-panicle', bend, end, 0.005, '#CEB65C'));
        for (let tier = 0; tier < 3; tier++)
          for (const side of [-1, 1]) {
            const t = (tier + 0.4) / 3;
            const spread = side * (0.027 - tier * 0.005);
            parts.push(
              part(
                'rice-hanging-grain',
                'kernel',
                [
                  bend[0] + (end[0] - bend[0]) * t - dz * spread,
                  bend[1] + (end[1] - bend[1]) * t - 0.018,
                  bend[2] + (end[2] - bend[2]) * t + dx * spread,
                ],
                [0.022, 0.052, 0.016],
                (index + tier) % 2 ? '#EBCB69' : '#D8B84E',
                [18, (angle * 180) / Math.PI, side * 18],
              ),
            );
          }
      }
  return parts;
}

/** A tied, harvested rice sheaf with drooping grains, separate from a growing plant. */
export function riceProductUnit(): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.039;
    const y = (i % 2) * 0.028;
    parts.push(
      part('rice-cut-straw', 'straw', [x, y, -0.055], [0.014, 0.39, 0.014], '#B7A15C', [90, 0, 0]),
    );
    for (let tier = 0; tier < 3; tier++)
      for (const side of [-1, 1])
        parts.push(
          part(
            'rice-harvested-grain',
            'kernel',
            [x + side * (0.025 - tier * 0.004), y + 0.013, 0.12 + tier * 0.035],
            [0.032, 0.066, 0.025],
            i % 2 ? '#E6C566' : '#D4B352',
            [72, side * 22, side * 12],
          ),
        );
  }
  parts.push(
    part('rice-sheaf-twine', 'binding', [0, 0.015, -0.035], [0.2, 0.06, 0.022], '#AD9064'),
  );
  return parts;
}
