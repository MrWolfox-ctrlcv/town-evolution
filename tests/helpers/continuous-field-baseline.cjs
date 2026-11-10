/** Frozen pre-optimization scalar oracle. Do not regenerate from current production code.
 * Original ContinuousField.ts SHA-256:
 * 69289b9aa6dde01f47c91715a3706fdf2c178c889641b0bdd6effdd81238cacb
 * Only relative imports and formatting differ from its TypeScript CommonJS output.
 * This pure CPU reference is not an engine substitute or a rendered-frame test.
 */
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ContinuousField = exports.TERRAIN_BASE = void 0;
const PositiveField_1 = require('../../.domain-build/art/PositiveField');
const ContinuousNoise_1 = require('../../.domain-build/art/ContinuousNoise');
const key = (x, z) => `${x},${z}`;
exports.TERRAIN_BASE = 0.015;
/** Natural geometry is immutable. Mining clips one saved column, never smooths its neighbors. */
class ContinuousField {
  constructor(size, seed, reference) {
    this.seed = seed;
    this.initial = new Map();
    this.heights = new Map();
    this.resources = new Map();
    this.cover = new PositiveField_1.PositiveField(size + 4, 0.3);
    this.stone = new PositiveField_1.PositiveField(size + 4, 0.3);
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        const cell = reference(x, z);
        if (!cell || !(cell.elevation > 0)) continue;
        this.initial.set(key(x, z), cell.elevation);
        this.cover.add(x + 2, z + 2, 1);
        if (cell.biome === 'mountain') this.stone.add(x + 2, z + 2, 1);
      }
  }
  sync(resources) {
    const next = new Map(
      resources.filter((r) => r.amount > 0).map((r) => [key(r.x, r.z), { ...r }]),
    );
    const changed = [];
    for (const cell of new Set([...next.keys(), ...this.resources.keys()])) {
      const old = this.resources.get(cell),
        now = next.get(cell);
      if (old?.amount !== now?.amount || old?.kind !== now?.kind || old?.id !== now?.id)
        changed.push(now ?? old);
    }
    this.resources.clear();
    for (const [cell, resource] of next) this.resources.set(cell, resource);
    return changed;
  }
  /** An uncut column has no horizontal artificial cap. */
  cutHeight(resource) {
    return resource.amount < (this.initial.get(key(resource.x, resource.z)) ?? resource.amount)
      ? exports.TERRAIN_BASE + resource.amount
      : Infinity;
  }
  heightInCell(x, z, cellX, cellZ) {
    const resource = this.resources.get(key(cellX, cellZ));
    return resource
      ? Math.min(this.naturalHeight(x, z), this.cutHeight(resource))
      : exports.TERRAIN_BASE;
  }
  height(x, z) {
    return this.heightInCell(x, z, Math.floor(x), Math.floor(z));
  }
  /** Bounded, immutable surface samples can be reused for the lifetime of this seed. */
  naturalHeight(x, z) {
    const id = key(x, z),
      cached = this.heights.get(id);
    if (cached !== undefined) return cached;
    const ix = Math.floor(x),
      iz = Math.floor(z);
    if (!this.initial.has(key(ix, iz))) return exports.TERRAIN_BASE;
    let distance = Infinity;
    for (let a = ix - 1; a <= ix + 1; a++)
      for (let b = iz - 1; b <= iz + 1; b++) {
        if (this.initial.has(key(a, b))) continue;
        distance = Math.min(
          distance,
          Math.hypot(Math.max(a - x, 0, x - a - 1), Math.max(b - z, 0, z - b - 1)),
        );
      }
    const envelope = (0, ContinuousNoise_1.smooth01)(distance / 0.42);
    if (!envelope) return exports.TERRAIN_BASE;
    const wx = x + 0.2 * (0, ContinuousNoise_1.perlin)(x * 0.19, z * 0.19, this.seed + 391);
    const wz = z + 0.2 * (0, ContinuousNoise_1.perlin)(x * 0.19, z * 0.19, this.seed + 613);
    const stencil = this.cover.stencil(wx, wz);
    const cover = Math.max(0.00001, this.cover.sample(stencil));
    const rock = (0, ContinuousNoise_1.clamp01)(this.stone.sample(stencil) / cover);
    const relief =
      (0.22 * (0, ContinuousNoise_1.perlin)(x * 0.63, z * 0.63, this.seed) +
        0.13 * (0, ContinuousNoise_1.perlin)(x * 1.7, z * 1.7, this.seed + 73) +
        0.06 *
          (1 - 2 * Math.abs((0, ContinuousNoise_1.perlin)(x * 3.1, z * 3.1, this.seed + 811)))) *
      (0.45 + 0.55 * rock);
    const height =
      exports.TERRAIN_BASE + Math.max(0.05, this.seedElevation(x, z) + relief) * envelope;
    this.heights.set(id, height);
    return height;
  }
  /** Interpolating the saved seed heights, rather than averaging them, preserves sharp summits.
   * Every cell center stays within less than one layer of its original integer height,
   * so even the first mining command makes an actual visible cut. */
  seedElevation(x, z) {
    x -= 0.5;
    z -= 0.5;
    const ix = Math.floor(x),
      iz = Math.floor(z);
    const weights = (t) => [
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
        const value = this.initial.get(key(ix + i - 1, iz + j - 1)) ?? 0;
        height += value * a[i] * b[j];
        maximum = Math.max(maximum, value);
      }
    return Math.max(0, Math.min(maximum, height));
  }
  normal(x, z) {
    const e = 0.004,
      nx = (this.naturalHeight(x - e, z) - this.naturalHeight(x + e, z)) / (2 * e),
      nz = (this.naturalHeight(x, z - e) - this.naturalHeight(x, z + e)) / (2 * e);
    const d = Math.hypot(nx, 1, nz);
    return [nx / d, 1 / d, nz / d];
  }
  color(resource, x, z, h, normal) {
    const grass = [0.55, 0.69, 0.32].map(
      (c) => c * (1 + (0, ContinuousNoise_1.terrainNoise)(x * 0.45, z * 0.45, this.seed) * 0.08),
    );
    let c;
    if (resource.kind === 'soil') {
      const t = (0, ContinuousNoise_1.clamp01)(
        0.32 +
          normal[1] * 0.68 +
          (0, ContinuousNoise_1.perlin)(x * 0.45, z * 0.45, this.seed + 239) * 0.25,
      );
      c = [0.59, 0.45, 0.29].map((v, i) => v * (1 - t) + [0.53, 0.65, 0.31][i] * t);
    } else {
      c = [0.57, 0.56, 0.54].map(
        (v) =>
          v +
          Math.min(1, h / 4) * 0.12 +
          (0, ContinuousNoise_1.terrainNoise)(x * 0.6, z * 0.6, this.seed) * 0.045 +
          (0, ContinuousNoise_1.perlin)(x * 2.1 + h * 0.53, z * 2.1 - h * 0.37, this.seed + 811) *
            0.055,
      );
      const moss =
        (0, ContinuousNoise_1.clamp01)((1.5 - h) * 0.8) *
        (0, ContinuousNoise_1.clamp01)((normal[1] - 0.3) * 1.7) *
        (0, ContinuousNoise_1.clamp01)(
          (0, ContinuousNoise_1.perlin)(x * 0.23, z * 0.23, this.seed) * 3 + 0.2,
        );
      c = c.map((v, i) => v * (1 - moss) + [0.4, 0.53, 0.27][i] * moss);
    }
    if (h < 0.26) {
      const t = (0, ContinuousNoise_1.smooth01)((h - 0.015) / 0.245);
      c = c.map((v, i) => grass[i] * (1 - t) + v * t);
    }
    return [...c.map(ContinuousNoise_1.clamp01), 1];
  }
}
exports.ContinuousField = ContinuousField;
