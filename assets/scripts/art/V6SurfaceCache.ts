import type { V6SurfaceChunk, V6SurfaceMesh } from './V6SurfaceContracts';
import type { MeshData } from './AssetTypes';
import type { V6CellSpan } from './V6CellSpans';
import { V6SurfaceBudget, v6SurfaceCost } from './V6SurfaceBudget';
export const V6_HOT_CACHE_BYTES = 32 * 1024 * 1024;
export const V6_HOT_CACHE_ENTRIES = 32;
export interface V6CachedSurface {
  signature: string;
  chunk: V6SurfaceChunk;
  spans: Map<string, V6CellSpan>;
  coast: V6CellSpan | null;
}
/** Only complete immutable snapshots enter this bounded LRU. Active snapshots are
 * charged by their normal chunk key; inactive snapshots share the same total ledger. */
export class V6SurfaceCache {
  private entries = new Map<string, V6CachedSurface>();
  private active = new Map<string, V6CachedSurface>();
  private versions = new Map<string, number>();
  private pinned = new Set<string>();
  private bytes = 0;
  constructor(
    private budget: V6SurfaceBudget,
    readonly limit = Math.min(V6_HOT_CACHE_BYTES, budget.limit / 4),
    readonly maxEntries = V6_HOT_CACHE_ENTRIES,
  ) {
    if (!Number.isFinite(limit) || limit < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 0)
      throw Error('Invalid terrain6 hot cache budget');
    budget.reclaim = (bytes) => this.trim(this.bytes - bytes);
  }
  signature(key: string, detailed: ReadonlySet<string>, error: number): string {
    const base = `${key}/${this.versions.get(key) ?? 0}/`;
    if (detailed.has(key)) return `${base}fine`;
    const [x, z] = key.split(',').map(Number);
    const mask = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].map(([dx, dz]) => Number(detailed.has(`${x! + dx!},${z! + dz!}`)));
    return `${base}far/${error}/${mask.join('')}`;
  }
  find(signature: string): V6CachedSurface | undefined {
    const entry = this.entries.get(signature);
    if (entry) {
      this.entries.delete(signature);
      this.entries.set(signature, entry);
      this.pinned.add(signature);
    }
    if (entry) return entry;
    const active = this.active.get(signature.split('/')[0]!);
    return active?.signature === signature ? active : undefined;
  }
  visualChanges(before: ReadonlySet<string>, after: ReadonlySet<string>) {
    return [...new Set([...before, ...after])]
      .filter((id) => before.has(id) !== after.has(id))
      .map((id) => {
        const [x, z] = id.split(',').map(Number);
        return { x: x!, z: z! };
      });
  }
  invalidate(keys: ReadonlySet<string>): void {
    for (const key of keys) this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    for (const [id, entry] of this.entries) if (keys.has(entry.chunk.key)) this.drop(id);
  }
  snapshot(
    signature: string,
    chunk: V6SurfaceChunk,
    spans: Map<string, V6CellSpan>,
    coast: MeshData | V6CellSpan | null,
  ): V6CachedSurface {
    return { signature, chunk, spans, coast: coast && 'mesh' in coast ? coast : null };
  }
  activate(key: string, next: V6CachedSurface | null): void {
    const old = this.active.get(key);
    if (next) this.drop(next.signature);
    if (
      old &&
      old.chunk !== next?.chunk &&
      old.signature !== next?.signature &&
      old.signature.startsWith(`${key}/${this.versions.get(key) ?? 0}/`)
    ) {
      this.entries.set(old.signature, old);
      this.bytes += v6SurfaceCost(old.chunk.mesh);
    }
    if (next) this.active.set(key, next);
    else this.active.delete(key);
    this.account();
  }
  finish(): void {
    this.pinned.clear();
    this.trim(this.limit);
  }
  private drop(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.bytes -= v6SurfaceCost(entry.chunk.mesh);
    this.entries.delete(id);
    this.account();
  }
  private account(): void {
    this.budget.publish('@hot-cache', this.bytes);
  }
  private trim(target: number): void {
    for (const id of this.entries.keys()) {
      if (this.bytes <= target && this.entries.size <= this.maxEntries) break;
      if (!this.pinned.has(id)) this.drop(id);
    }
  }
  meshes(): ReadonlySet<V6SurfaceMesh> {
    return new Set([...this.entries.values()].map((e) => e.chunk.mesh));
  }
  usage() {
    return {
      bytes: this.bytes,
      entries: this.entries.size,
      limit: this.limit,
      maxEntries: this.maxEntries,
    };
  }
  clear(): void {
    this.entries.clear();
    this.active.clear();
    this.versions.clear();
    this.pinned.clear();
    this.bytes = 0;
    this.account();
  }
}
