import { PositiveField } from './v5-basis';
import { clamp01, perlin, smooth01 } from './v5-noise';
export const V5_TERRAIN_BASE = 0.015;
export const V5_MAX_RESOURCE_LAYERS = 64;
export interface V5ReferenceCell {
  biome: 'plain' | 'mountain' | 'forest' | 'hill';
  surfaceHeight: number;
}
export interface V5Reference {
  size: number;
  seed: number;
  /** Must return null for water and every partially wet/reserved cell. */
  at(x: number, z: number): V5ReferenceCell | null;
}
export interface V5NaturalResource {
  id: string;
  x: number;
  z: number;
  kind: 'stone' | 'soil';
  amount: number;
}
/** Immutable seeded geometry and its integer stock recipe; no renderer/game state dependency.
 * Stock is calculated at each cell center, independent of resource depletion or view loading.
 * A bounded optional sample cache affects only speed, never the returned value.
 */
export class V5HeightRecipe {
  private readonly cover: PositiveField;
  private readonly stone: PositiveField;
  private readonly initial = new Map<string, number>();
  private readonly biomes = new Map<string, V5ReferenceCell['biome']>();
  private readonly layers = new Map<string, number>();
  private readonly heights = new Map<string, number>();
  readonly size: number;
  readonly seed: number;
  constructor(
    private readonly reference: V5Reference,
    private readonly cacheLimit = 80_000,
  ) {
    if (!Number.isInteger(reference.size) || reference.size < 1 || reference.size > 192)
      throw new Error('Invalid v5 size');
    if (!Number.isSafeInteger(reference.seed) || reference.seed <= 0)
      throw new Error('Invalid v5 seed');
    if (!Number.isInteger(cacheLimit) || cacheLimit < 0 || cacheLimit > 80_000)
      throw new Error('Invalid sample cache limit');
    this.size = reference.size;
    this.seed = reference.seed;
    this.cover = new PositiveField(this.size + 4, 0.3);
    this.stone = new PositiveField(this.size + 4, 0.3);
    for (let z = 0; z < this.size; z++)
      for (let x = 0; x < this.size; x++) {
        const cell = reference.at(x, z);
        if (!cell) continue;
        if (
          !Number.isFinite(cell.surfaceHeight) ||
          cell.surfaceHeight < 0 ||
          cell.surfaceHeight > 64
        )
          throw new Error('Invalid v5 continuous height');
        if (!(cell.surfaceHeight > 0)) continue;
        if (cell.biome !== 'mountain' && cell.biome !== 'hill')
          throw new Error('Only mountain/hill cells may contain natural columns');
        const id = `${x},${z}`;
        this.initial.set(id, cell.surfaceHeight);
        this.biomes.set(id, cell.biome);
        this.cover.add(x + 2, z + 2, 1);
        if (cell.biome === 'mountain') this.stone.add(x + 2, z + 2, 1);
      }
    for (const id of this.initial.keys()) {
      const [x, z] = id.split(',').map(Number);
      const layers = Math.max(
        1,
        Math.ceil(this.naturalHeight(x! + 0.5, z! + 0.5) - V5_TERRAIN_BASE),
      );
      if (layers > V5_MAX_RESOURCE_LAYERS)
        throw new Error('V5 stock exceeds version-specific limit');
      this.layers.set(id, layers);
    }
  }
  usesReference(reference: V5Reference): boolean {
    return this.reference === reference;
  }
  initialStock(x: number, z: number): number {
    return this.layers.get(`${x},${z}`) ?? 0;
  }
  resourceAt(x: number, z: number): V5NaturalResource | null {
    const amount = this.initialStock(x, z);
    return amount
      ? {
          id: `n${x}_${z}`,
          x,
          z,
          kind: this.biomes.get(`${x},${z}`) === 'mountain' ? 'stone' : 'soil',
          amount,
        }
      : null;
  }
  resourcesForNewWorld(): V5NaturalResource[] {
    const result: V5NaturalResource[] = [];
    for (const id of this.initial.keys()) {
      const [x, z] = id.split(',').map(Number);
      result.push(this.resourceAt(x!, z!)!);
    }
    return result;
  }
  acceptsResource(value: V5NaturalResource): boolean {
    if (!Number.isInteger(value.x) || !Number.isInteger(value.z) || !Number.isInteger(value.amount))
      return false;
    const initial = this.resourceAt(value.x, value.z);
    return (
      !!initial &&
      value.id === initial.id &&
      value.kind === initial.kind &&
      value.amount > 0 &&
      value.amount <= initial.amount
    );
  }
  cutHeight(resource: V5NaturalResource): number {
    return resource.amount < this.initialStock(resource.x, resource.z)
      ? V5_TERRAIN_BASE + resource.amount
      : Infinity;
  }
  heightInCell(x: number, z: number, resource: V5NaturalResource | null): number {
    return resource && resource.amount > 0
      ? Math.min(this.naturalHeight(x, z), this.cutHeight(resource))
      : V5_TERRAIN_BASE;
  }
  naturalHeight(x: number, z: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('Invalid surface sample');
    const id = `${x},${z}`,
      cached = this.heights.get(id);
    if (cached !== undefined) return cached;
    const ix = Math.floor(x),
      iz = Math.floor(z);
    if (!this.initial.has(`${ix},${iz}`)) return V5_TERRAIN_BASE;
    let distance = Infinity;
    for (let a = ix - 1; a <= ix + 1; a++)
      for (let b = iz - 1; b <= iz + 1; b++) {
        if (this.initial.has(`${a},${b}`)) continue;
        distance = Math.min(
          distance,
          Math.hypot(Math.max(a - x, 0, x - a - 1), Math.max(b - z, 0, z - b - 1)),
        );
      }
    const envelope = smooth01(distance / 0.42);
    if (!envelope) return V5_TERRAIN_BASE;
    const wx = x + 0.2 * perlin(x * 0.19, z * 0.19, this.seed + 391);
    const wz = z + 0.2 * perlin(x * 0.19, z * 0.19, this.seed + 613);
    const stencil = this.cover.stencil(wx, wz);
    const cover = Math.max(0.00001, this.cover.sample(stencil));
    const rock = clamp01(this.stone.sample(stencil) / cover);
    const relief =
      (0.22 * perlin(x * 0.63, z * 0.63, this.seed) +
        0.13 * perlin(x * 1.7, z * 1.7, this.seed + 73) +
        0.06 * (1 - 2 * Math.abs(perlin(x * 3.1, z * 3.1, this.seed + 811)))) *
      (0.45 + 0.55 * rock);
    const height = V5_TERRAIN_BASE + Math.max(0.05, this.seedElevation(x, z) + relief) * envelope;
    if (this.cacheLimit > 0) {
      if (this.heights.size >= this.cacheLimit)
        this.heights.delete(this.heights.keys().next().value!);
      this.heights.set(id, height);
    }
    return height;
  }
  private seedElevation(x: number, z: number): number {
    x -= 0.5;
    z -= 0.5;
    const ix = Math.floor(x),
      iz = Math.floor(z);
    const weights = (t: number) => [
      -0.5 * t + t * t - 0.5 * t * t * t,
      1 - 2.5 * t * t + 1.5 * t * t * t,
      0.5 * t + 2 * t * t - 1.5 * t * t * t,
      -0.5 * t * t + 0.5 * t * t * t,
    ];
    const a = weights(x - ix),
      b = weights(z - iz);
    let height = 0,
      maximum = 0;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const value = this.initial.get(`${ix + i - 1},${iz + j - 1}`) ?? 0;
        height += value * a[i]! * b[j]!;
        maximum = Math.max(maximum, value);
      }
    return Math.max(0, Math.min(maximum, height));
  }
  cacheEntries(): number {
    return this.heights.size;
  }
  clearSampleCache(): void {
    this.heights.clear();
  }
}
