import { V6_SIZE, V6_SUBDIVISIONS } from './v6-contracts';
import type { V6Landform } from './v6-landform';
import type { V6Hydrology } from './v6-hydrology';
import type { V6Starter } from './v6-build-starter';
export interface V6Lattice {
  grounds: Float32Array;
  stones: Float32Array;
  soils: Float32Array;
}
/** Exact original Float32 storage/interpolation. No game state is constructed here. */
export class V6Samples {
  readonly size = V6_SIZE;
  readonly hydrology: V6Hydrology;
  readonly starter: V6Starter;
  readonly #latticeSize = V6_SIZE * V6_SUBDIVISIONS + 1;
  readonly #grounds: Float32Array;
  readonly #stones: Float32Array;
  readonly #soils: Float32Array;
  readonly #landform: V6Landform;
  constructor(
    readonly seed: number,
    landform: V6Landform,
    grid: V6Lattice,
  ) {
    this.#landform = landform;
    this.hydrology = landform.hydrology;
    this.starter = landform.starter;
    this.#grounds = grid.grounds;
    this.#stones = grid.stones;
    this.#soils = grid.soils;
  }
  vertex(gx: number, gz: number): { ground: number; stone: number; soil: number } {
    if (
      !Number.isInteger(gx) ||
      !Number.isInteger(gz) ||
      gx < 0 ||
      gz < 0 ||
      gx >= this.#latticeSize ||
      gz >= this.#latticeSize
    )
      throw Error('Invalid v6 lattice vertex');
    const i = gz * this.#latticeSize + gx;
    if (Number.isNaN(this.#grounds[i]!)) {
      const p = this.#landform.sample(gx / 4, gz / 4);
      this.#grounds[i] = p.ground;
      this.#stones[i] = p.stone;
      this.#soils[i] = p.soil;
    }
    return {
      ground: this.#grounds[i]!,
      stone: this.#stones[i]!,
      soil: this.#soils[i]!,
    };
  }
  cellSamples(x: number, z: number) {
    const out: ReturnType<V6Samples['vertex']>[] = [];
    for (let j = 0; j <= 4; j++)
      for (let i = 0; i <= 4; i++) out.push(this.vertex(x * 4 + i, z * 4 + j));
    return out;
  }
  private interpolated(x: number, z: number, deposit: boolean): number {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw Error('Invalid v6 sample');
    if (x < 0 || z < 0 || x >= this.size || z >= this.size)
      return this.hydrology.sample(x, z).height;
    const hc = this.hydrology.at(Math.floor(x), Math.floor(z));
    if (hc?.state !== 'dryBuildable' || this.hydrology.reserveCell(Math.floor(x), Math.floor(z)))
      return this.hydrology.sample(x, z).height;
    const gx = Math.floor(x * 4),
      gz = Math.floor(z * 4),
      u = x * 4 - gx,
      v = z * 4 - gz;
    const at = (dx: number, dz: number) => {
      const q = this.vertex(gx + dx, gz + dz);
      return deposit ? Math.fround(q.ground + Math.max(q.stone, q.soil)) : q.ground;
    };
    const a = at(0, 0),
      c = at(1, 1);
    return v >= u
      ? a * (1 - v) + at(0, 1) * (v - u) + c * u
      : a * (1 - u) + c * v + at(1, 0) * (u - v);
  }
  groundHeight(x: number, z: number): number {
    return this.interpolated(x, z, false);
  }
  naturalHeight(x: number, z: number): number {
    return this.interpolated(x, z, true);
  }
}
