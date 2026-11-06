import type { CurvedResource } from './ContinuousField';
import type { V3 } from './AssetTypes';
import { v5Noise } from '../domain/v5-world';
const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (lo: number, hi: number, value: number): number => {
  const t = clamp((value - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};

/** Pure display functions for compatible v5 and separate rolling-relief experiments. */
export function v5DisplayNormal(
  height: (x: number, z: number) => number,
  x: number,
  z: number,
  e = 0.25,
): V3 {
  // Area-weighted sum of the SIX actual 0.25-lattice triangles meeting at a vertex.
  // Same global stencil at every cell/chunk seam. Do not differentiate sub-grid relief.
  const sw = height(x - e, z - e);
  const w = height(x - e, z);
  const s = height(x, z - e);
  const east = height(x + e, z);
  const ne = height(x + e, z + e);
  const north = height(x, z + e);
  const nx = 2 * w + sw - s - 2 * east - ne + north;
  const ny = 6 * e;
  const nz = 2 * s + sw - w - 2 * north - ne + east;
  const length = Math.hypot(nx, ny, nz);
  return [nx / length, ny / length, nz / length];
}

export function v5DisplayColor(
  seed: number,
  resource: Pick<CurvedResource, 'kind'>,
  x: number,
  z: number,
  h: number,
  n: V3,
): number[] {
  const broad = v5Noise(x * 0.12, z * 0.12, seed + 239) - 0.5;
  const grass = [0.53, 0.68, 0.31].map((v) => v + broad * 0.045);
  if (resource.kind === 'soil') return [...grass, 1];
  // Broad mineral patches only, independent of height: no stretched high-frequency streaks.
  const mineral = v5Noise(x * 0.28, z * 0.28, seed + 811) - 0.5;
  let color = [0.57, 0.59, 0.56].map((v) => v + mineral * 0.065);
  const moss = (1 - smooth(3, 16, h)) * smooth(0.38, 0.78, n[1]) * smooth(-0.22, 0.28, broad) * 0.7;
  color = color.map((v, i) => v * (1 - moss) + grass[i]! * moss);
  const snow = smooth(30, 39, h) * smooth(0.4, 0.8, n[1]);
  color = color.map((v, i) => v * (1 - snow) + [0.87, 0.9, 0.88][i]! * snow);
  const edge = smooth(0.015, 0.42, h);
  return [...color.map((v, i) => clamp(grass[i]! * (1 - edge) + v * edge)), 1];
}
