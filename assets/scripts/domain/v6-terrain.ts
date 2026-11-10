import { V7_GENERATOR_REVISION } from './v7-contracts';
import { v6SurfaceNormal } from './v6-normal';
import { V6_GENERATOR_REVISION, key, inWorld, v6StratumPlane } from './v6-contracts';
import type { V6Cell, V6Resource, V6Snapshot, Deposit } from './v6-contracts';
import { V6Samples } from './v6-samples';
import type { V6Lattice } from './v6-samples';
import type { V6Landform } from './v6-landform';
export * from './v6-contracts';
export interface CompletedCells {
  cells: Array<V6Cell | null>;
  deposits: Map<string, Deposit>;
  trees: readonly {
    readonly x: number;
    readonly z: number;
    readonly baseElevation: number;
  }[];
}
/** Completed terrain only. Supported construction entry point is V6TerrainBuilder. */
export class V6Terrain extends V6Samples {
  readonly revision: typeof V6_GENERATOR_REVISION | typeof V7_GENERATOR_REVISION;
  readonly treeCandidates: CompletedCells['trees'];
  readonly #cells: CompletedCells['cells'];
  readonly #deposits: CompletedCells['deposits'];
  constructor(
    seed: number,
    landform: V6Landform,
    grid: V6Lattice,
    complete: CompletedCells,
    revision: typeof V6_GENERATOR_REVISION | typeof V7_GENERATOR_REVISION = V6_GENERATOR_REVISION,
  ) {
    super(seed, landform, grid);
    this.revision = revision;
    this.#cells = complete.cells;
    this.#deposits = complete.deposits;
    this.treeCandidates = complete.trees;
    Object.freeze(this);
  }
  at(x: number, z: number): V6Cell | null {
    return inWorld(x, z) ? (this.#cells[z * this.size + x] ?? null) : null;
  }
  /** Exact dry-cell lattice extrema; piecewise linear interiors cannot exceed these vertices. */
  cellUpperBound(x: number, z: number): number {
    const cell = this.at(x, z);
    return Math.max(
      0.015,
      cell?.groundRange[1] ?? 0.015,
      this.#deposits.get(key(x, z))?.ceiling ?? 0.015,
    );
  }
  initialResources(): readonly V6Resource[] {
    return Object.freeze([...this.#deposits.values()].map((d) => d.resource));
  }
  initialStock(x: number, z: number): number {
    return this.#deposits.get(key(x, z))?.resource.amount ?? 0;
  }
  resourceAt(x: number, z: number): V6Resource | null {
    return this.#deposits.get(key(x, z))?.resource ?? null;
  }
  occupiedLevels(x: number, z: number): readonly number[] {
    return this.#deposits.get(key(x, z))?.levels ?? Object.freeze([]);
  }
  acceptsResource(r: V6Resource): boolean {
    const a = this.resourceAt(r.x, r.z);
    return (
      !!a &&
      inWorld(r.x, r.z) &&
      a.id === r.id &&
      a.kind === r.kind &&
      Number.isInteger(r.amount) &&
      r.amount > 0 &&
      r.amount <= a.amount
    );
  }
  cutHeight(r: V6Resource): number {
    if (!this.acceptsResource(r)) throw Error('Invalid v6 cut resource');
    const d = this.#deposits.get(key(r.x, r.z))!;
    return r.amount === d.resource.amount ? Infinity : v6StratumPlane(d.levels[r.amount - 1]!);
  }
  heightInCell(x: number, z: number, cellX: number, cellZ: number, state: V6Snapshot): number {
    const ground = this.groundHeight(x, z),
      r = state.resources.get(key(cellX, cellZ));
    return r ? Math.max(ground, Math.min(this.naturalHeight(x, z), this.cutHeight(r))) : ground;
  }
  height(x: number, z: number, state: V6Snapshot): number {
    return this.heightInCell(x, z, Math.floor(x), Math.floor(z), state);
  }
  normal(x: number, z: number, ground = false): readonly [number, number, number] {
    return v6SurfaceNormal(this, x, z, ground);
  }
}
