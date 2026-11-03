import { part } from './AssetTypes';
import type { Part, V3 } from './AssetTypes';
/** Legacy narrow blade, retained for tiny awns only. */
export const BLADE = {
  vertices: [
    [-0.04, -0.5, 0],
    [0.04, -0.5, 0],
    [-0.3, 0, 0.12],
    [0.3, 0, 0.12],
    [-0.005, 0.5, 0.3],
    [0.005, 0.5, 0.3],
  ] as const,
  faces: [
    [0, 1, 3],
    [0, 3, 2],
    [2, 3, 5],
    [2, 5, 4],
    [3, 1, 0],
    [2, 3, 0],
    [5, 3, 2],
    [4, 5, 2],
  ],
};
export type PlantStage = 'seedling' | 'young' | 'ready';
function stem(name: string, a: V3, b: V3, width: number, color: string): Part {
  const d = b.map((v, i) => v - a[i]!),
    length = Math.hypot(...d);
  return part(
    name,
    'grain',
    a.map((v, i) => (v + b[i]!) / 2) as unknown as V3,
    [width, length, width],
    color,
    [(Math.asin(d[2]! / length) * 180) / Math.PI, 0, (-Math.atan2(d[0]!, d[1]!) * 180) / Math.PI],
  );
}
/** Slender cereal plants form a continuous canopy, with narrow two-row ears. */
export function wheatGeometry(stage: PlantStage): Part[] {
  const parts: Part[] = [],
    ready = stage === 'ready',
    young = stage === 'young';
  const rows = ready ? 8 : young ? 6 : 3;
  const spacing = 0.51 / (rows - 1);
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < rows; col++) {
      const i = row * rows + col,
        angle = i * 2.399;
      const x = (col - (rows - 1) / 2) * spacing + Math.sin(i * 7.1) * 0.003;
      const z = (row - (rows - 1) / 2) * spacing + Math.cos(i * 4.3) * 0.003;
      const dx = Math.cos(angle),
        dz = Math.sin(angle);
      const height =
        (ready ? 0.57 : young ? 0.39 : 0.23) +
        (ready || young ? ((i * 7) % 5) * 0.012 + Math.sin(i * 2.7) * 0.022 : 0);
      const hx = x + dx * (ready ? 0.012 : 0.008),
        hz = z + dz * (ready ? 0.012 : 0.008);
      parts.push({
        ...stem(
          'wheat-stem',
          [x, 0.17, z],
          [hx, height + 0.09, hz],
          ready ? 0.006 : 0.005,
          ready ? '#C6A048' : '#82A54B',
        ),
        shape: 'straw',
      });
      for (let leaf = 0; leaf < 2; leaf++)
        parts.push(
          part(
            'wheat-narrow-leaf',
            'cerealLeaf',
            [x, ready ? 0.34 : young ? 0.28 : 0.205, z],
            [ready ? 0.024 : young ? 0.021 : 0.012, ready ? 0.26 : young ? 0.18 : 0.08, 0.035],
            ready ? '#D4B34D' : leaf ? '#A0BE58' : '#79A047',
            [ready ? 12 : 20, (angle * 180) / Math.PI + leaf * 160, 0],
          ),
        );
      if (!ready) continue;
      for (let tier = 0; tier < 4; tier++)
        for (const side of [-1, 1]) {
          const offset = side * (0.014 - tier * 0.002) + tier * 0.003;
          parts.push(
            part(
              'wheat-ear',
              'kernel',
              [hx + dx * offset, height + tier * 0.041, hz + dz * offset],
              [0.025 - tier * 0.002, 0.066, 0.018 - tier * 0.001],
              ['#F2C34B', '#E8B53C', '#F6D26A'][(i + tier) % 3]!,
              [side * 12, (-angle * 180) / Math.PI, side * 18],
            ),
          );
        }
      for (const side of [1])
        parts.push(
          part(
            'wheat-awn',
            'cerealLeaf',
            [hx + dx * (0.012 + side * 0.008), height + 0.185, hz + dz * (0.012 + side * 0.008)],
            [0.002, 0.085, 0.012],
            '#EBC86B',
            [0, (-angle * 180) / Math.PI, side * 10],
          ),
        );
    }
  return parts;
}
export function carrotGeometry(stage: PlantStage): Part[] {
  const parts: Part[] = [],
    ready = stage === 'ready',
    young = stage === 'young';
  for (const x of [-0.14, 0.14])
    for (const z of [-0.14, 0.14]) {
      if (ready)
        parts.push(part('carrot-root', 'grain', [x, 0.165, z], [0.137, 0.13, 0.137], '#E9973E'));
      const base = ready ? 0.205 : 0.176;
      for (let frond = 0; frond < (ready ? 5 : young ? 4 : 3); frond++) {
        const angle = frond * 2.399 + (x > 0 ? 0.4 : 0),
          yaw = (angle * 180) / Math.PI;
        const length = ready ? 0.215 : young ? 0.165 : 0.075;
        const dx = Math.sin(angle),
          dz = Math.cos(angle);
        parts.push(
          stem(
            'carrot-petiole',
            [x, base, z],
            [x + dx * 0.055, base + length * 0.65, z + dz * 0.055],
            0.007,
            '#61933E',
          ),
        );
        parts.push(
          part(
            'carrot-frond',
            'frond',
            [x + dx * 0.035, base + length * 0.47, z + dz * 0.035],
            [ready ? 0.09 : young ? 0.07 : 0.04, length, 0.07],
            ['#6C9E42', '#81B04C', '#5C913A'][frond % 3]!,
            [35 + (frond % 2) * 18, yaw, 0],
          ),
        );
      }
    }
  return parts;
}
