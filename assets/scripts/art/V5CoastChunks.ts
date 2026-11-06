import type { MeshData } from './AssetTypes';
import type { V5CoastSource, V5CoastJob } from './V5Coast';
import { emptyNaturalMesh } from './NaturalMesh';
export interface V5CoastTransaction {
  chunks: readonly { key: string; mesh: MeshData }[];
  commit(): void;
}
/** Independent first-load chunks; local marine edits retain one visible atomic group. */
export class V5CoastChunks {
  private wanted = new Set<string>();
  private live = new Map<string, MeshData>();
  private dirty = new Set<string>();
  private epoch = 0;
  private work: Array<{ key: string; job: V5CoastJob | null }> | null = null;
  private built: Array<{ key: string; mesh: MeshData }> = [];
  private pending: V5CoastTransaction | null = null;
  constructor(private source: V5CoastSource) {}
  update(source: V5CoastSource, changedCells: readonly { x: number; z: number }[]): void {
    this.source = source;
    for (const p of changedCells)
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        this.dirty.add(`${Math.floor((p.x + dx!) / 16)},${Math.floor((p.z + dz!) / 16)}`);
    this.cancel();
  }
  request(keys: readonly string[]): void {
    const next = new Set(keys);
    if (next.size === this.wanted.size && [...next].every((k) => this.wanted.has(k))) return;
    this.wanted = next;
    this.cancel();
  }
  private cancel(): void {
    this.epoch++;
    this.work = null;
    this.built = [];
    this.pending = null;
  }
  advance(maxBlocks = 8, maxMilliseconds = 3): V5CoastTransaction | null {
    if (this.pending) return this.pending;
    if (!this.work) {
      const edits = [...this.wanted].filter((k) => this.dirty.has(k));
      const fresh = [...this.wanted].find((k) => !this.live.has(k));
      const keys = edits.length ? edits : fresh ? [fresh] : [];
      for (const key of this.live.keys()) if (!this.wanted.has(key)) keys.push(key);
      if (!keys.length) return null;
      this.work = keys.map((key) => ({
        key,
        job: this.wanted.has(key) ? this.source.begin(key) : null,
      }));
    }
    const start = performance.now();
    let steps = 0;
    while (this.work.length && steps < maxBlocks && performance.now() - start < maxMilliseconds) {
      const current = this.work[0]!;
      if (!current.job || current.job.advance(1)) {
        this.built.push({
          key: current.key,
          mesh: current.job ? current.job.result() : emptyNaturalMesh(),
        });
        this.work.shift();
      }
      steps++;
    }
    if (this.work.length) return null;
    const epoch = this.epoch,
      chunks = this.built.slice();
    const transaction: V5CoastTransaction = {
      chunks,
      commit: () => {
        if (this.pending !== transaction || epoch !== this.epoch)
          throw Error('Stale coast transaction');
        const next = new Map(this.live);
        for (const c of chunks) {
          if (c.mesh.indices.length && this.wanted.has(c.key)) next.set(c.key, c.mesh);
          else next.delete(c.key);
          this.dirty.delete(c.key);
        }
        this.live = next;
        this.cancel();
      },
    };
    this.pending = transaction;
    return transaction;
  }
  isCurrent(transaction: V5CoastTransaction): boolean {
    return this.pending === transaction;
  }
  isSettled(): boolean {
    return (
      !this.work &&
      !this.pending &&
      [...this.wanted].every((k) => this.live.has(k) && !this.dirty.has(k)) &&
      [...this.live.keys()].every((k) => this.wanted.has(k))
    );
  }
  resident(): ReadonlyMap<string, MeshData> {
    return this.live;
  }
  dispose(): void {
    this.cancel();
    this.live.clear();
    this.wanted.clear();
    this.dirty.clear();
  }
}
