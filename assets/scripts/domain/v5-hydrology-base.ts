import { createV5WaterFields } from './v5-hydrology-fields';
import type { V5WaterFields, V5WaterKind } from './v5-hydrology-fields';
import { v5Clamp } from './v5-hydrology-shapes';
export type { V5WaterFields, V5WaterKind } from './v5-hydrology-fields';
export const V5_HYDROLOGY_REVISION = 'mouth-resource-smooth-union-1';
export const V5_SEA_LEVEL = -0.62;
export const V5_LAND_HEIGHT = 0.015;
export interface V5BaseHydrologySample extends V5WaterFields {
  readonly bankScale: number;
  readonly height: number;
  readonly color: readonly [number, number, number];
}
export interface V5BaseHydrologyCell {
  readonly x: number;
  readonly z: number;
  readonly state: 'dryBuildable' | 'clearWater' | 'reservedBank';
  readonly waterKind: V5WaterKind;
  readonly dryLower: number;
  readonly dryUpper: number;
  readonly freshLower: number;
  readonly oceanLower: number;
  readonly seaDockWater: boolean;
  readonly certificate: Readonly<{
    lipschitz: 1;
    coverRadius: number;
    dryMargin: 0.15;
    requiredDepth: number;
  }>;
}
const PROFILE: readonly (readonly [number, number, readonly [number, number, number]])[] = [
  [0, 0, [0.53, 0.68, 0.31]],
  [0.2, 0.09, [0.66, 0.7, 0.4]],
  [0.75, 0.22, [0.9, 0.82, 0.6]],
  [1.45, 0.43, [0.88, 0.79, 0.57]],
  [1.95, 0.59, [0.73, 0.67, 0.49]],
  [2.35, 0.74, [0.62, 0.66, 0.52]],
  [3.3, 1.1, [0.43, 0.58, 0.54]],
];
/** New-v5-only continuous geometry. Ownership and saved extensions never alter this base field. */
export class V5BaseHydrology {
  readonly size = 192;
  readonly featureBounds = null;
  reserveCell(_x: number, _z: number): boolean {
    return false;
  }
  readonly version = V5_HYDROLOGY_REVISION;
  readonly metadata;
  readonly riverPath;
  readonly fields: (x: number, z: number) => V5WaterFields;
  private readonly samples = new Map<string, V5BaseHydrologySample>();
  private readonly cells = new Map<string, V5BaseHydrologyCell>();
  constructor(readonly seed: number) {
    if (!Number.isSafeInteger(seed) || seed <= 0 || seed > 1_000_000_000)
      throw new Error('Invalid V5 map seed');
    const source = createV5WaterFields(seed);
    this.metadata = source.metadata;
    this.riverPath = source.riverPath;
    this.fields = source.fields;
    Object.freeze(this);
  }
  sample(x: number, z: number): V5BaseHydrologySample {
    const key = `${x},${z}`,
      cached = this.samples.get(key);
    if (cached) return cached;
    const f = this.fields(x, z);
    let t = v5Clamp(-f.freshwater / 4, 0, 1);
    t = t * t * (3 - 2 * t);
    const bankScale = 0.14 + 0.86 * t,
      p = Math.max(0, -f.dry) / bankScale;
    let i = PROFILE.findIndex((row) => row[0] >= p);
    if (i < 0) i = PROFILE.length - 1;
    const hi = PROFILE[i]!,
      lo = PROFILE[Math.max(0, i - 1)]!;
    const a = hi[0] === lo[0] ? 0 : v5Clamp((p - lo[0]) / (hi[0] - lo[0]), 0, 1);
    const color = Object.freeze(
      lo[2].map((v, k) => v * (1 - a) + hi[2][k]! * a) as [number, number, number],
    );
    const value = Object.freeze({
      ...f,
      bankScale,
      height: 0.015 - lo[1] * (1 - a) - hi[1] * a,
      color,
    });
    if (this.samples.size >= 8192) this.samples.delete(this.samples.keys().next().value!);
    this.samples.set(key, value);
    return value;
  }
  classifyCell(x: number, z: number): V5BaseHydrologyCell {
    if (!Number.isInteger(x) || !Number.isInteger(z) || Math.abs(x) > 1e6 || Math.abs(z) > 1e6)
      throw new Error('Invalid V5 hydrology cell');
    const key = `${x},${z}`,
      cached = this.cells.get(key);
    if (cached) return cached;
    const f = this.fields(x + 0.5, z + 0.5),
      radius = Math.SQRT1_2;
    const dryLower = f.dry - radius,
      dryUpper = f.dry + radius;
    const freshLower = f.freshwater - radius,
      oceanLower = f.ocean - radius;
    const requiredDepth = freshLower >= 0 ? 0.49 : 3.35,
      clearWater = dryUpper <= -requiredDepth;
    const state = dryLower >= 0.15 ? 'dryBuildable' : clearWater ? 'clearWater' : 'reservedBank';
    const certificate = Object.freeze({
      lipschitz: 1 as const,
      coverRadius: radius,
      dryMargin: 0.15 as const,
      requiredDepth,
    });
    const value: V5BaseHydrologyCell = Object.freeze({
      x,
      z,
      state,
      waterKind: f.waterKind,
      dryLower,
      dryUpper,
      freshLower,
      oceanLower,
      seaDockWater: clearWater && oceanLower >= 3.35 && f.freshwater + radius <= -1,
      certificate,
    });
    if (this.cells.size >= 4096) this.cells.delete(this.cells.keys().next().value!);
    this.cells.set(key, value);
    return value;
  }
  at(x: number, z: number): V5BaseHydrologyCell | null {
    return Number.isInteger(x) &&
      Number.isInteger(z) &&
      x >= 0 &&
      z >= 0 &&
      x < this.size &&
      z < this.size
      ? this.classifyCell(x, z)
      : null;
  }
  cacheSizes() {
    return { samples: this.samples.size, cells: this.cells.size };
  }
}
const worlds = new Map<number, V5BaseHydrology>();
export function getV5BaseHydrology(seed: number): V5BaseHydrology {
  const cached = worlds.get(seed);
  if (cached) {
    worlds.delete(seed);
    worlds.set(seed, cached);
    return cached;
  }
  const world = new V5BaseHydrology(seed);
  if (worlds.size >= 4) worlds.delete(worlds.keys().next().value!);
  worlds.set(seed, world);
  return world;
}
