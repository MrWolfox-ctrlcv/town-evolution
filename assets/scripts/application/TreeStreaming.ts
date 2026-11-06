import { TreeBatchBuilder } from '../art/V5TreeGeometry';
import type { StreamTree, TreeBatch } from '../art/V5TreeGeometry';
import { treeGrowthProgress } from '../domain/game';
import type { GameState } from '../domain/types';
export interface WorldViewBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}
export interface TreeStreamBudget {
  maxTrees?: number;
  maxMilliseconds?: number;
  maxUploadBytes?: number;
}
interface Chunk {
  key: string;
  x: number;
  z: number;
  trees: StreamTree[];
  signature: string;
}
interface Published {
  signature: string;
  far: boolean;
  batch: TreeBatch;
}
/** State owns identities. View loading only stages/recycles meshes, never creates gameplay trees. */
export class TreeStreaming {
  private chunks = new Map<string, Chunk>();
  private live = new Map<string, Published>();
  private pending: {
    chunk: Chunk;
    far: boolean;
    builder: TreeBatchBuilder;
    batch?: TreeBatch;
  } | null = null;
  private seed = 0;
  private credit = 0;
  private disposed = false;
  loading = false;
  private treeInput: GameState['trees'] | null = null;
  private syncedAt = -Infinity;
  private nextGrowthAt = Infinity;
  constructor(
    private readonly publish: (key: string, batch: TreeBatch) => boolean | void,
    private readonly remove: (key: string) => void,
    private readonly cancel: (key: string) => void = () => {},
  ) {}
  sync(state: GameState, now: number): void {
    if (this.disposed) return;
    if (this.seed !== state.mapSeed) {
      this.clear();
      this.seed = state.mapSeed;
    }
    const effectiveNow = Math.max(now, state.lastSeenAt);
    if (
      this.treeInput === state.trees &&
      effectiveNow >= this.syncedAt &&
      effectiveNow < this.nextGrowthAt
    )
      return;
    this.treeInput = state.trees;
    this.syncedAt = effectiveNow;
    this.nextGrowthAt = Infinity;
    const chunks = new Map<string, Chunk>();
    for (const tree of state.trees) {
      const x = Math.floor(tree.x / 16),
        z = Math.floor(tree.z / 16),
        key = `${x}:${z}`;
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = { key, x, z, trees: [], signature: '' };
        chunks.set(key, chunk);
      }
      const stage = Math.floor(treeGrowthProgress(tree, effectiveNow) * 3);
      if (stage < 3 && tree.plantedAt !== undefined && tree.readyAt !== undefined)
        this.nextGrowthAt = Math.min(
          this.nextGrowthAt,
          tree.plantedAt + ((stage + 1) * (tree.readyAt - tree.plantedAt)) / 3,
        );
      chunk.trees.push({
        id: tree.id,
        x: tree.x,
        z: tree.z,
        stage,
      });
    }
    for (const chunk of chunks.values()) {
      chunk.trees.sort((a, b) => a.id.localeCompare(b.id));
      chunk.signature = JSON.stringify(chunk.trees);
    }
    for (const [key, entry] of this.live)
      if (chunks.get(key)?.signature !== entry.signature) {
        this.remove(key);
        this.live.delete(key);
      }
    if (
      this.pending &&
      chunks.get(this.pending.chunk.key)?.signature !== this.pending.chunk.signature
    )
      this.cancelPending();
    if ([...chunks].some(([key, c]) => this.chunks.get(key)?.signature !== c.signature))
      this.loading = true;
    this.chunks = chunks;
  }
  frame(
    bounds: WorldViewBounds,
    budget: TreeStreamBudget = {},
    clock: () => number = Date.now,
  ): boolean {
    if (
      this.disposed ||
      ![bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ].every(Number.isFinite) ||
      bounds.minX > bounds.maxX ||
      bounds.minZ > bounds.maxZ
    )
      return false;
    const far = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) > 64,
      cx = (bounds.minX + bounds.maxX) / 2,
      cz = (bounds.minZ + bounds.maxZ) / 2;
    const wanted = [...this.chunks.values()].filter(
      (c) =>
        c.x * 16 - 2 <= bounds.maxX &&
        (c.x + 1) * 16 + 2 >= bounds.minX &&
        c.z * 16 - 2 <= bounds.maxZ &&
        (c.z + 1) * 16 + 2 >= bounds.minZ,
    );
    const keys = new Set(wanted.map((c) => c.key));
    let changed = false;
    for (const key of this.live.keys())
      if (!keys.has(key)) {
        this.remove(key);
        this.live.delete(key);
        changed = true;
      }
    if (this.pending && (!keys.has(this.pending.chunk.key) || this.pending.far !== far))
      this.cancelPending();
    const maxTrees = Math.max(0, Math.floor(budget.maxTrees ?? 24)),
      maxMs = Math.max(0, budget.maxMilliseconds ?? 2),
      upload = Math.max(0, Math.floor(budget.maxUploadBytes ?? 262144));
    this.credit = Math.min(8388608, this.credit + upload);
    const started = clock();
    let count = 0;
    wanted.sort(
      (a, b) =>
        Math.hypot(a.x * 16 + 8 - cx, a.z * 16 + 8 - cz) -
          Math.hypot(b.x * 16 + 8 - cx, b.z * 16 + 8 - cz) || a.key.localeCompare(b.key),
    );
    while (count < maxTrees && clock() - started < maxMs) {
      if (!this.pending) {
        const chunk = wanted.find(
          (c) =>
            this.live.get(c.key)?.signature !== c.signature || this.live.get(c.key)?.far !== far,
        );
        if (!chunk) break;
        this.pending = { chunk, far, builder: new TreeBatchBuilder(this.seed, chunk.trees, far) };
      }
      const pending = this.pending;
      if (!pending.builder.complete) {
        pending.builder.append();
        count++;
      }
      if (!pending.builder.complete) continue;
      const batch = (pending.batch ??= pending.builder.finish());
      if (batch.bytes > this.credit) break;
      if (this.publish(pending.chunk.key, batch) === false) break;
      this.live.set(pending.chunk.key, { signature: pending.chunk.signature, far, batch });
      this.credit -= batch.bytes;
      this.pending = null;
      changed = true;
      break; // At most one complete chunk upload/publication in a Cocos frame.
    }
    this.loading = wanted.some(
      (c) => this.live.get(c.key)?.signature !== c.signature || this.live.get(c.key)?.far !== far,
    );
    return changed;
  }
  *surfaces() {
    for (const entry of this.live.values()) yield* entry.batch.surfaces.entries();
  }
  private cancelPending(): void {
    if (this.pending) this.cancel(this.pending.chunk.key);
    this.pending = null;
  }
  private clear(): void {
    for (const key of this.live.keys()) this.remove(key);
    this.live.clear();
    this.cancelPending();
    this.credit = 0;
    this.treeInput = null;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.chunks.clear();
    this.loading = false;
  }
}
