import { V5ResourceField } from './V5ResourceField';
import { resourcePatch } from './ResourcePatch';
import { emptyNaturalMesh } from './NaturalMesh';
import type { CurvedResource } from './ContinuousField';
import type { MeshData, V3 } from './AssetTypes';
import type { NaturalSurfaceData, NaturalResourceSurface } from './NaturalSurfaceData';
export const v5ChunkKey = (x: number, z: number) => `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
export interface V5ResourceChunk {
  key: string;
  revision: number;
  mesh: MeshData;
  surface: NaturalSurfaceData;
}
export interface V5ResourceTransaction {
  revision: number;
  chunks: readonly V5ResourceChunk[];
  rebuiltCells: number;
  commit(): NaturalSurfaceData;
}
interface Patch {
  resource: CurvedResource;
  mesh: MeshData;
}
/** Real spatial rebuilds. CPU preparation is synchronous in this first integration;
 * no worker/frame-budget claim is implied. Uploaders must stage the entire changed
 * group before committing its exact quantized picker/support snapshot. */
export class V5ResourceChunks {
  readonly field: V5ResourceField;
  private revision = 0;
  private readonly dirty = new Set<string>();
  private patches = new Map<string, Map<string, Patch>>();
  private chunks = new Map<string, V5ResourceChunk>();
  private published: NaturalSurfaceData = { positions: [], resources: [], chunks: [] };
  constructor(seed: number) {
    this.field = new V5ResourceField(seed);
  }
  private wanted = new Set<string>();
  private epoch = 0;
  private atomicKeys = new Set<string>();
  private forceAll = false;
  private work: Array<{
    key: string;
    patches: Map<string, Patch>;
    cells: Array<[number, number]>;
    cursor: number;
    merge: Generator<void, V5ResourceChunk> | null;
  }> | null = null;
  private built: V5ResourceChunk[] = [];
  private pending: V5ResourceTransaction | null = null;
  private rebuilt = 0;
  update(resources: readonly CurvedResource[]): void {
    const changed = this.field.sync(resources);
    if (!changed.length) return;
    this.revision++;
    for (const r of changed)
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        this.dirty.add(`${r.x + dx!},${r.z + dz!}`);
        if (this.revision > 1) this.atomicKeys.add(v5ChunkKey(r.x + dx!, r.z + dz!));
      }
    this.cancelWork();
  }
  request(keys: readonly string[]): void {
    const next = new Set(keys);
    if (next.size === this.wanted.size && [...next].every((k) => this.wanted.has(k))) return;
    this.wanted = next;
    this.epoch++;
    this.cancelWork();
    for (const r of this.field.resources.values())
      if (next.has(v5ChunkKey(r.x, r.z)) && !this.chunks.has(v5ChunkKey(r.x, r.z)))
        this.dirty.add(`${r.x},${r.z}`);
  }
  private cancelWork(): void {
    this.work = null;
    this.built = [];
    this.pending = null;
    this.rebuilt = 0;
    this.preparedPatches?.clear();
  }
  /** Cooperative real patch construction; no Node-worker or browser-worker claim. */
  advance(maxPatches = 8, maxMilliseconds = 3): V5ResourceTransaction | null {
    if (this.pending) return this.pending;
    if (!this.work) {
      const groups = new Map<string, Array<[number, number]>>();
      for (const id of this.dirty) {
        const [x, z] = id.split(',').map(Number),
          key = v5ChunkKey(x!, z!);
        if (!this.wanted.has(key)) continue;
        const list = groups.get(key) ?? [];
        list.push([x!, z!]);
        groups.set(key, list);
      }
      for (const key of this.chunks.keys()) if (!this.wanted.has(key)) groups.set(key, []);
      if (!groups.size) return null;
      if (!this.forceAll) {
        const atomic = [...groups.keys()].filter(
          (k) => this.wanted.has(k) && this.atomicKeys.has(k),
        );
        const first = [...this.wanted].find((k) => groups.has(k));
        const selected = new Set(atomic.length ? atomic : first ? [first] : []);
        for (const key of groups.keys())
          if (this.wanted.has(key) && !selected.has(key)) groups.delete(key);
      }
      this.forceAll = false;
      this.work = [...groups].map(([key, cells]) => ({
        key,
        cells,
        cursor: 0,
        merge: null,
        patches: this.wanted.has(key) ? new Map(this.patches.get(key)) : new Map(),
      }));
    }
    const start = performance.now();
    let count = 0;
    while (this.work.length && count < maxPatches && performance.now() - start < maxMilliseconds) {
      const job = this.work[0]!;
      if (job.cursor === job.cells.length) {
        job.merge ??= this.mergeSteps(job.key, this.revision, job.patches);
        const next = job.merge.next();
        count++;
        if (next.done) {
          this.built.push(next.value);
          this.preparedPatches.set(job.key, job.patches);
          this.work.shift();
        }
        continue;
      }
      const [x, z] = job.cells[job.cursor++]!,
        r = this.field.resources.get(`${x},${z}`);
      job.patches.delete(`n${x}_${z}`);
      if (r) {
        job.patches.set(r.id, { resource: r, mesh: resourcePatch(this.field, r) });
        this.rebuilt++;
      }
      count++;
    }
    if (this.work.length) return null;
    const revision = this.revision,
      epoch = this.epoch,
      built = this.built.slice(),
      dirty = [...this.dirty].filter((id) => {
        const [x, z] = id.split(',').map(Number);
        return (
          this.wanted.has(v5ChunkKey(x!, z!)) && built.some((c) => c.key === v5ChunkKey(x!, z!))
        );
      });
    const caches = new Map(this.preparedPatches);
    const transaction: V5ResourceTransaction = {
      revision,
      chunks: built,
      rebuiltCells: this.rebuilt,
      commit: () => {
        if (revision !== this.revision || epoch !== this.epoch || this.pending !== transaction)
          throw Error('Stale v5 resource transaction');
        const next = new Map(this.chunks),
          nextPatches = new Map(this.patches);
        for (const c of built) {
          if (c.mesh.indices.length && this.wanted.has(c.key)) {
            next.set(c.key, c);
            nextPatches.set(c.key, caches.get(c.key)!);
          } else {
            next.delete(c.key);
            nextPatches.delete(c.key);
          }
        }
        const surface: NaturalSurfaceData = {
          positions: [],
          resources: [],
          chunks: [...next.values()].map((c) => c.surface),
        };
        this.chunks = next;
        this.patches = nextPatches;
        for (const id of dirty) this.dirty.delete(id);
        for (const c of built) this.atomicKeys.delete(c.key);
        this.published = surface;
        this.preparedPatches.clear();
        this.cancelWork();
        return surface;
      },
    };
    this.pending = transaction;
    return transaction;
  }
  private preparedPatches = new Map<string, Map<string, Patch>>();
  /** Synchronous test/offline convenience; presentation uses update/request/advance. */
  prepare(resources: readonly CurvedResource[]): V5ResourceTransaction | null {
    this.update(resources);
    this.request([...new Set(resources.map((r) => v5ChunkKey(r.x, r.z)))]);
    this.forceAll = true;
    const result = this.advance(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    return result;
  }
  private *mergeSteps(
    key: string,
    revision: number,
    patches: Map<string, Patch>,
  ): Generator<void, V5ResourceChunk> {
    const mesh = emptyNaturalMesh(),
      surfaces: NaturalResourceSurface[] = [];
    for (const { resource: r, mesh: p } of patches.values()) {
      const offset = mesh.positions.length / 3,
        indices = p.indices.map((i) => i + offset),
        min: [number, number, number] = [Infinity, Infinity, Infinity],
        max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.positions.length; i++) {
        const v = Math.fround(p.positions[i]!);
        mesh.positions.push(v);
        const axis = i % 3;
        min[axis] = Math.min(min[axis]!, v);
        max[axis] = Math.max(max[axis]!, v);
      }
      mesh.normals.push(...p.normals);
      mesh.colors.push(...p.colors);
      mesh.indices.push(...indices);
      for (let a = 0; a < 3; a++) {
        mesh.min[a] = Math.min(mesh.min[a]!, min[a]!);
        mesh.max[a] = Math.max(mesh.max[a]!, max[a]!);
      }
      surfaces.push({
        id: r.id,
        indices,
        min,
        max,
        center: [r.x + 0.5, Math.fround(this.field.height(r.x + 0.5, r.z + 0.5)), r.z + 0.5] as V3,
      });
      yield;
    }
    if (!mesh.indices.length) {
      mesh.min = [0, 0.015, 0];
      mesh.max = [0, 0.015, 0];
    }
    return { key, revision, mesh, surface: { positions: mesh.positions, resources: surfaces } };
  }
  isSettled(): boolean {
    if (this.work || this.pending) return false;
    for (const id of this.dirty) {
      const [x, z] = id.split(',').map(Number);
      if (this.wanted.has(v5ChunkKey(x!, z!))) return false;
    }
    return ![...this.chunks.keys()].some((k) => !this.wanted.has(k));
  }
  isCurrent(transaction: V5ResourceTransaction): boolean {
    return this.pending === transaction;
  }
  surface(): NaturalSurfaceData {
    return this.published;
  }
  residentChunks(): readonly V5ResourceChunk[] {
    return [...this.chunks.values()];
  }
  dispose(): void {
    this.cancelWork();
    this.wanted.clear();
    this.atomicKeys.clear();
    this.patches.clear();
    this.chunks.clear();
    this.dirty.clear();
    this.field.resources.clear();
    this.published = { positions: [], resources: [], chunks: [] };
  }
}
