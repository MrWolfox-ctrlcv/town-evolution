import { V6SurfaceBudget, v6SurfaceCost } from './V6SurfaceBudget';
import type { NaturalSurfaceData } from './NaturalSurfaceData';
import type { V5CoastSource } from './V6Coast';
import type { V6SurfaceSource, V6SurfaceChunk } from './V6SurfaceContracts';
import type { V6CellPatch, V6CellSpan } from './V6CellSpans';
import { buildV6SurfaceMeshSteps } from './V6SurfaceMesh';
import { mergeV6SurfaceJob, type V6SurfaceJob } from './V6SurfaceChunkWork';
import { buildV6FarSurfaceSteps } from './V6FarSurfaceMesh';
const neighbors = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
export const v6ChunkKey = (x: number, z: number) => `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
export interface V6SurfaceTransaction {
  chunks: readonly V6SurfaceChunk[];
  rebuiltCells: number;
  commit(): NaturalSurfaceData;
}
export class V6SurfaceChunks {
  private wanted = new Set<string>();
  private detailed = new Set<string>();
  private lodDirty = new Set<string>();
  private live = new Map<string, V6SurfaceChunk>();
  private patches = new Map<string, Map<string, V6CellPatch>>();
  private coasts = new Map<string, V6CellSpan>();
  private dirty = new Set<string>();
  private coastDirty = new Set<string>();
  private jobs: V6SurfaceJob[] | null = null;
  private done: V6SurfaceJob[] = [];
  private built: V6SurfaceChunk[] = [];
  private pending: V6SurfaceTransaction | null = null;
  private epoch = 0;
  private rebuilt = 0;
  private farError = 0.25;
  constructor(
    private source: V6SurfaceSource,
    private coast: V5CoastSource,
    private readonly budget = new V6SurfaceBudget(),
    private visualCells: ReadonlySet<string> = new Set(),
  ) {}
  setVisualCells(cells: ReadonlySet<string>): void {
    this.visualCells = cells;
  }
  update(
    source: V6SurfaceSource,
    changes: readonly { x: number; z: number }[],
    coast?: V5CoastSource,
  ): void {
    this.source = source;
    if (coast) this.coast = coast;
    if (!changes.length) return;
    for (const p of changes)
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const radius = Math.abs(dx) + Math.abs(dz),
            x = p.x + dx,
            z = p.z + dz;
          // Far edge segments depend on the neighboring cell's qualification.
          if (radius > 2 || (radius === 2 && this.detailed.has(v6ChunkKey(x, z)))) continue;
          this.dirty.add(`${x},${z}`);
          if (coast) this.coastDirty.add(v6ChunkKey(x, z));
        }
    this.cancel();
  }
  request(
    keys: readonly string[],
    details: readonly string[] = keys,
    farError = this.farError,
  ): void {
    if (!(farError >= 0 && farError <= 0.25)) throw Error('Invalid far error');
    const errorChanged = farError !== this.farError;
    if (errorChanged)
      for (const [key, chunk] of this.live) if (!chunk.detail) this.lodDirty.add(key);
    this.farError = farError;
    const next = new Set(keys),
      fine = new Set(details.filter((k) => next.has(k)));
    if (
      !errorChanged &&
      next.size === this.wanted.size &&
      [...next].every((k) => this.wanted.has(k)) &&
      fine.size === this.detailed.size &&
      [...fine].every((k) => this.detailed.has(k))
    )
      return;
    for (const key of new Set([...this.detailed, ...fine]))
      if (this.detailed.has(key) !== fine.has(key)) {
        const [x, z] = key.split(',').map(Number);
        for (const [dx, dz] of neighbors) {
          const neighbor = `${x! + dx!},${z! + dz!}`;
          if (this.live.has(neighbor) && next.has(neighbor)) this.lodDirty.add(neighbor);
        }
      }
    this.wanted = next;
    this.detailed = fine;
    this.cancel();
  }
  abort(): void {
    this.cancel();
  }
  memoryUsage = () => this.budget.usage();
  private cancel(): void {
    this.budget.cancel();
    this.epoch++;
    this.jobs = null;
    this.done = [];
    this.built = [];
    this.pending = null;
    this.rebuilt = 0;
  }
  advance(maxSteps = 512, maxMilliseconds = 3): V6SurfaceTransaction | null {
    if (this.pending) return this.pending;
    if (!this.jobs) {
      const dirtyKeys = new Set(
        [...this.dirty].map((id) => {
          const [x, z] = id.split(',').map(Number);
          return v6ChunkKey(x!, z!);
        }),
      );
      const changed = [...this.wanted].filter(
        (k) => dirtyKeys.has(k) || this.coastDirty.has(k) || this.lodDirty.has(k),
      );
      const fresh = [...this.wanted].find((k) => !this.live.has(k));
      const evicted = [...this.live.keys()].filter((key) => !this.wanted.has(key));
      const keys = evicted.length ? evicted : changed.length ? changed : fresh ? [fresh] : [];
      if (!keys.length) return null;
      this.jobs = keys.map((key) => {
        const wanted = this.wanted.has(key),
          [cx, cz] = key.split(',').map(Number),
          cells: Array<[number, number]> = [];
        if (wanted)
          for (let z = cz! * 16; z < (cz! + 1) * 16; z++)
            for (let x = cx! * 16; x < (cx! + 1) * 16; x++)
              if (
                x >= 0 &&
                z >= 0 &&
                x < this.source.world.size &&
                z < this.source.world.size &&
                (!this.live.has(key) || this.lodDirty.has(key) || this.dirty.has(`${x},${z}`))
              )
                cells.push([x, z]);
        return {
          key,
          detail: this.detailed.has(key),
          cells,
          index: 0,
          cellJob: null,
          cellCost: 0,
          patches: wanted ? new Map(this.patches.get(key)) : new Map(),
          spans: new Map(),
          coastJob:
            wanted &&
            (!this.coasts.has(key) ||
              this.coastDirty.has(key) ||
              this.live.get(key)?.detail !== this.detailed.has(key))
              ? this.coast.begin(key, !this.detailed.has(key))
              : null,
          coast: wanted ? (this.coasts.get(key) ?? null) : null,
          merge: null,
        };
      });
    }
    const start = performance.now();
    let steps = 0;
    while (this.jobs.length && steps++ < maxSteps && performance.now() - start < maxMilliseconds) {
      const job = this.jobs[0]!;
      if (job.coastJob) {
        if (job.coastJob.advance(1)) {
          job.coast = job.coastJob.result();
          this.budget.reserve(v6SurfaceCost(job.coast));
          job.coastJob = null;
        }
        continue;
      }
      if (job.index < job.cells.length) {
        const [x, z] = job.cells[job.index]!;
        job.cellJob ??= job.detail
          ? buildV6SurfaceMeshSteps(this.source, x, z, 1, 1)
          : buildV6FarSurfaceSteps(
              this.source,
              x,
              z,
              1,
              1,
              (xx, zz) =>
                this.detailed.has(v6ChunkKey(xx, zz)) || this.visualCells.has(`${xx},${zz}`),
              this.farError,
            );
        const next = job.cellJob.next(),
          cost = v6SurfaceCost(next.value);
        this.budget.reserve(cost - job.cellCost);
        job.cellCost = cost;
        if (next.done) {
          const patch = next.value;
          if (patch.indices.length) job.patches.set(`${x},${z}`, patch);
          else job.patches.delete(`${x},${z}`);
          job.cellJob = null;
          job.cellCost = 0;
          job.index++;
          this.rebuilt++;
        }
        continue;
      }
      job.merge ??= mergeV6SurfaceJob(job, this.budget);
      const next = job.merge.next();
      if (next.done) {
        this.built.push(next.value);
        this.done.push(job);
        this.jobs.shift();
      }
    }
    if (this.jobs.length) return null;
    const epoch = this.epoch,
      chunks = this.built.slice(),
      jobs = this.done.slice();
    const transaction: V6SurfaceTransaction = {
      chunks,
      rebuiltCells: this.rebuilt,
      commit: () => {
        if (this.pending !== transaction || epoch !== this.epoch)
          throw Error('Stale terrain6 surface transaction');
        for (const job of jobs) {
          const chunk = chunks.find((c) => c.key === job.key)!;
          this.budget.publish(job.key, this.wanted.has(job.key) ? v6SurfaceCost(chunk.mesh) : 0);
          if (this.wanted.has(job.key)) {
            this.live.set(job.key, chunk);
            this.patches.set(job.key, job.spans);
            if (job.coast && 'mesh' in job.coast) this.coasts.set(job.key, job.coast);
          } else {
            this.live.delete(job.key);
            this.patches.delete(job.key);
            this.coasts.delete(job.key);
          }
          for (const [x, z] of job.cells) this.dirty.delete(`${x},${z}`);
          this.coastDirty.delete(job.key);
          this.lodDirty.delete(job.key);
        }
        this.cancel();
        return {
          positions: [],
          resources: [],
          chunks: [...this.live.values()].filter((c) => c.detail !== false).map((c) => c.surface),
        };
      },
    };
    this.pending = transaction;
    return transaction;
  }
  isCurrent(t: V6SurfaceTransaction): boolean {
    return this.pending === t;
  }
  resident(): ReadonlyMap<string, V6SurfaceChunk> {
    return this.live;
  }
  ready(x: number, z: number): boolean {
    return (
      this.live.get(v6ChunkKey(x, z))?.detail !== false &&
      !this.lodDirty.has(v6ChunkKey(x, z)) &&
      this.visible(x, z)
    );
  }
  visible(x: number, z: number): boolean {
    const key = v6ChunkKey(x, z);
    if (!this.live.has(key) || this.coastDirty.has(key)) return false;
    for (const id of this.dirty) {
      const [xx, zz] = id.split(',').map(Number);
      if (v6ChunkKey(xx!, zz!) === key) return false;
    }
    return true;
  }
  isSettled(): boolean {
    return (
      !this.pending &&
      !this.jobs &&
      [...this.wanted].every(
        (k) => this.live.has(k) && !this.coastDirty.has(k) && !this.lodDirty.has(k),
      ) &&
      ![...this.dirty].some((id) => {
        const [x, z] = id.split(',').map(Number);
        return this.wanted.has(v6ChunkKey(x!, z!));
      }) &&
      [...this.live.keys()].every((k) => this.wanted.has(k))
    );
  }
  dispose(): void {
    this.cancel();
    this.live.clear();
    this.budget.clear();
    this.patches.clear();
    this.coasts.clear();
    this.wanted.clear();
    this.dirty.clear();
    this.coastDirty.clear();
    this.lodDirty.clear();
    this.detailed.clear();
  }
}
