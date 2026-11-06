import type { NaturalCoastFeature, CoastCellBounds } from './v5-natural-coast-types';
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const coastSmooth = (x: number) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
export function coastTransform(p: Pick<NaturalCoastFeature, 'rotation' | 'anchor'>) {
  const a = (p.rotation * Math.PI) / 2,
    u: readonly [number, number] = Object.freeze([
      Math.round(Math.cos(a)),
      -Math.round(Math.sin(a)),
    ]),
    v: readonly [number, number] = Object.freeze([
      Math.round(Math.sin(a)),
      Math.round(Math.cos(a)),
    ]),
    origin: readonly [number, number] = Object.freeze([p.anchor.x + 1, p.anchor.z + 1]);
  return {
    axes: Object.freeze({ u, v, origin }),
    toWorld: (x: number, z: number): readonly [number, number] => [
      origin[0] + u[0] * x + v[0] * z,
      origin[1] + u[1] * x + v[1] * z,
    ],
    toLocal: (x: number, z: number): readonly [number, number] => [
      (x - origin[0]) * u[0] + (z - origin[1]) * u[1],
      (x - origin[0]) * v[0] + (z - origin[1]) * v[1],
    ],
  };
}
function analyticShore(p: NaturalCoastFeature, u: number): number {
  const a = Math.abs(u),
    bias = u < 0 ? p.leftShoulder : p.rightShoulder;
  if (a <= 1.05) return 1;
  if (a <= 3.25) return 1 - 0.34 * coastSmooth((a - 1.05) / 2.2);
  return 0.66 + bias * coastSmooth((a - 3.25) / 4.75);
}

export function coastShore(feature: NaturalCoastFeature, u: number): number {
  const a = Math.floor(u * 4) / 4,
    q = (u - a) * 4;
  return analyticShore(feature, a) * (1 - q) + analyticShore(feature, a + 0.25) * q;
}
export function coastShoreRange(feature: NaturalCoastFeature, u0: number, u1: number) {
  let min = Math.min(coastShore(feature, u0), coastShore(feature, u1)),
    max = Math.max(coastShore(feature, u0), coastShore(feature, u1));
  for (let u = Math.max(-8, Math.ceil(u0 * 4) / 4); u < Math.min(8, u1); u += 0.25) {
    const v = coastShore(feature, u);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
}
export function coastCellBounds(
  toLocal: (x: number, z: number) => readonly [number, number],
  x: number,
  z: number,
): CoastCellBounds {
  const p = [
    [x, z],
    [x + 1, z],
    [x, z + 1],
    [x + 1, z + 1],
  ].map(([a, b]) => toLocal(a!, b!));
  return {
    u0: Math.min(...p.map((p) => p[0])),
    u1: Math.max(...p.map((p) => p[0])),
    v0: Math.min(...p.map((p) => p[1])),
    v1: Math.max(...p.map((p) => p[1])),
  };
}
