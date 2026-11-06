import { getV5BaseHydrology } from './v5-hydrology-base';
import { deriveNaturalCoast, V5_NATURAL_COAST_REVISION } from './v5-natural-coast-feature';
import type { CoastSide, NaturalCoastCell, NaturalCoastSample } from './v5-natural-coast-feature';
export { getV5BaseHydrology, V5_SEA_LEVEL, V5_LAND_HEIGHT } from './v5-hydrology-base';
export type { V5WaterFields, V5WaterKind } from './v5-hydrology-fields';
export type V5HydrologyCell = NaturalCoastCell;
export type V5HydrologySample = NaturalCoastSample;
export const V5_HYDROLOGY_REVISION = V5_NATURAL_COAST_REVISION;
/** New-v5-only piecewise solid geometry. Base distance data is never a cliff-depth certificate. */
export class V5Hydrology {
  readonly size = 192;
  readonly version = V5_HYDROLOGY_REVISION;
  readonly base;
  readonly metadata;
  readonly riverPath;
  readonly fields;
  readonly baseFields;
  readonly naturalCoast;
  readonly feature;
  readonly featureBounds;
  private readonly cells = new Map<string, NaturalCoastCell>();
  constructor(readonly seed: number) {
    this.base = getV5BaseHydrology(seed);
    this.metadata = this.base.metadata;
    this.riverPath = this.base.riverPath;
    this.fields = this.base.fields;
    this.baseFields = this.base.fields;
    this.naturalCoast = deriveNaturalCoast(this.base);
    this.feature = this.naturalCoast.feature;
    this.featureBounds = this.naturalCoast.patchBounds;
    Object.freeze(this);
  }
  sample(x: number, z: number, side: CoastSide = 'auto'): NaturalCoastSample {
    const value = this.naturalCoast.sample(x, z, side);
    return Object.freeze({
      ...value,
      color: Object.freeze([...value.color]) as readonly [number, number, number],
    });
  }
  classifyCell(x: number, z: number): NaturalCoastCell {
    if (!Number.isInteger(x) || !Number.isInteger(z) || Math.abs(x) > 1e6 || Math.abs(z) > 1e6)
      throw new Error('Invalid hydrology cell');
    const key = `${x},${z}`,
      old = this.cells.get(key);
    if (old) return old;
    const cell = this.naturalCoast.classifyCell(x, z),
      value = Object.freeze({ ...cell, certificate: Object.freeze(cell.certificate) });
    if (this.cells.size >= 4096) this.cells.delete(this.cells.keys().next().value!);
    this.cells.set(key, value);
    return value;
  }
  at(x: number, z: number): NaturalCoastCell | null {
    return Number.isInteger(x) &&
      Number.isInteger(z) &&
      x >= 0 &&
      z >= 0 &&
      x < this.size &&
      z < this.size
      ? this.classifyCell(x, z)
      : null;
  }
  reserveCell(x: number, z: number): boolean {
    return this.naturalCoast.reserveCell(x, z);
  }
  boundaryCell(x: number, z: number): boolean {
    return this.naturalCoast.boundaryCell(x, z);
  }
  isMarineOriginCell(x: number, z: number): boolean {
    return this.naturalCoast.isMarineOriginCell(x, z);
  }
  cacheSizes() {
    return { samples: this.base.cacheSizes().samples, cells: this.cells.size };
  }
}
const worlds = new Map<number, V5Hydrology>();
export function getV5Hydrology(seed: number): V5Hydrology {
  const old = worlds.get(seed);
  if (old) {
    worlds.delete(seed);
    worlds.set(seed, old);
    return old;
  }
  const world = new V5Hydrology(seed);
  if (worlds.size >= 4) worlds.delete(worlds.keys().next().value!);
  worlds.set(seed, world);
  return world;
}
