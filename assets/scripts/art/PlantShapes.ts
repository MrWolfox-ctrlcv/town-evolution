import { CEREAL_SHAPES } from './CerealShapes';
import { PRODUCT_SHAPES } from './ProductShapes';
import type { V3 } from './AssetTypes';
/** Plant surfaces use round cross-sections and continuous leaf contours, not gems. */
export interface PlantShape {
  vertices: V3[];
  faces: number[][];
  smooth: boolean;
}
function spindle(segments = 6): PlantShape {
  const vertices: V3[] = [[0, -0.5, 0]],
    faces: number[][] = [];
  for (const y of [-0.22, 0.22])
    for (let i = 0; i < segments; i++) {
      const a = (i * Math.PI * 2) / segments;
      vertices.push([Math.cos(a) * 0.5, y, Math.sin(a) * 0.5]);
    }
  vertices.push([0, 0.5, 0]);
  for (let i = 0; i < segments; i++) {
    const a = 1 + i,
      b = 1 + ((i + 1) % segments);
    faces.push(
      [0, b, a],
      [a, b, b + segments, a + segments],
      [a + segments, b + segments, 1 + segments * 2],
    );
  }
  return { vertices, faces: faces.map((f) => f.reverse()), smooth: true };
}
function leaf(fern: boolean): PlantShape {
  const vertices: V3[] = [],
    faces: number[][] = [];
  const steps = fern ? 14 : 5;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const width =
      0.012 + Math.pow(Math.sin(Math.PI * t), 0.8) * 0.488 * (fern ? (i % 2 ? 1 : 0.38) : 1);
    const y = t - 0.5,
      bend = 0.8 * t * t;
    vertices.push([-width, y, bend], [0, y, bend - 0.09 * Math.sin(Math.PI * t)], [width, y, bend]);
    if (i) {
      const p = (i - 1) * 3;
      faces.push([p, p + 3, p + 4, p + 1], [p + 1, p + 4, p + 5, p + 2]);
    }
  }
  const n = vertices.length;
  vertices.push(...vertices.map((v) => [...v] as unknown as V3));
  faces.push(
    ...faces.map((f) =>
      f
        .slice()
        .reverse()
        .map((i) => i + n),
    ),
  );
  return { vertices, faces, smooth: true };
}
export const PLANT_SHAPES: Record<string, PlantShape> = {
  ...PRODUCT_SHAPES,
  grain: spindle(),
  ...CEREAL_SHAPES,
  ribbon: leaf(false),
  frond: leaf(true),
};
