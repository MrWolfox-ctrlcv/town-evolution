import type { V3 } from './AssetTypes';
import { sawnWoodShape } from './SawnWoodShape';
/** Closed profiles for cut timber, a tapered carrot root, and a rope loop. */
function lathe(profile: Array<[number, number]>, smooth: boolean) {
  const vertices: V3[] = [],
    faces: number[][] = [],
    segments = 10;
  for (const [y, r] of profile)
    for (let i = 0; i < segments; i++) {
      const a = (i * Math.PI * 2) / segments;
      vertices.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
  for (let row = 1; row < profile.length; row++)
    for (let i = 0; i < segments; i++) {
      const a = (row - 1) * segments + i,
        b = (row - 1) * segments + ((i + 1) % segments);
      faces.push([a, a + segments, b + segments, b]);
    }
  faces.push(Array.from({ length: segments }, (_, i) => i));
  faces.push(Array.from({ length: segments }, (_, i) => profile.length * segments - 1 - i));
  return { vertices, faces, smooth };
}
function rope() {
  const vertices: V3[] = [],
    faces: number[][] = [],
    sides = 12,
    tube = 4;
  for (let i = 0; i < sides; i++)
    for (let j = 0; j < tube; j++) {
      const a = (i * Math.PI * 2) / sides,
        b = (j * Math.PI * 2) / tube;
      vertices.push([
        Math.cos(a) * (0.44 + 0.06 * Math.cos(b)),
        Math.sin(a) * (0.44 + 0.06 * Math.cos(b)),
        0.5 * Math.sin(b),
      ]);
    }
  for (let i = 0; i < sides; i++)
    for (let j = 0; j < tube; j++)
      faces.push([
        i * tube + j,
        ((i + 1) % sides) * tube + j,
        ((i + 1) % sides) * tube + ((j + 1) % tube),
        i * tube + ((j + 1) % tube),
      ]);
  return { vertices, faces, smooth: true };
}
export const PRODUCT_SHAPES = {
  sawnTimber: sawnWoodShape(),
  log: lathe(
    [
      [-0.5, 0.5],
      [0.5, 0.5],
    ],
    false,
  ),
  root: lathe(
    [
      [-0.5, 0.015],
      [-0.35, 0.12],
      [-0.1, 0.29],
      [0.2, 0.44],
      [0.38, 0.5],
      [0.5, 0.28],
    ],
    true,
  ),
  binding: rope(),
};
