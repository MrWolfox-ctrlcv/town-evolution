import type { TreeBatch } from '../art/V6TreeGeometry';
export interface V6CachedTrees {
  signature: string;
  far: boolean;
  batch: TreeBatch;
}
/** Extra inactive CPU snapshots only. Live/staging trees and all GPU allocations
 * remain outside this ledger; it is not a heap measurement or a total tree cap. */
export const V6_TREE_CACHE_BYTES = 8 * 1024 * 1024;
export function v6TreeCacheCost(entry: V6CachedTrees): number {
  const { mesh, surfaces, anchors } = entry.batch;
  // Two 8-byte slots per retained number, including the exact-ID pick copies.
  // Shared canonical indices are charged again rather than undercounted.
  return (
    (mesh.positions.length * 2 +
      mesh.normals.length +
      mesh.colors.length +
      mesh.indices.length * 2) *
      16 +
    surfaces.size * 512 +
    anchors.length * 64 +
    entry.signature.length * 2 +
    1024
  );
}
export class V6TreeCache {
  private readonly entries = new Map<
    string,
    { key: string; entry: V6CachedTrees; bytes: number }
  >();
  private bytes = 0;
  constructor(readonly limit = V6_TREE_CACHE_BYTES) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw Error('Invalid v6 tree cache budget');
  }
  remember(key: string, entry: V6CachedTrees, wanted: ReadonlySet<string> = new Set()): void {
    const id = `${key}/${Number(entry.far)}`,
      bytes = v6TreeCacheCost(entry);
    this.remove(id);
    if (bytes > this.limit) return;
    while (this.bytes + bytes > this.limit || this.entries.size >= 32) {
      const victim = [...this.entries].find(([, value]) => !wanted.has(value.key));
      // Do not evict the returning view just to retain the view being left.
      if (!victim) return;
      this.remove(victim[0]);
    }
    this.entries.set(id, { key, entry, bytes });
    this.bytes += bytes;
  }
  take(
    key: string,
    signature: string,
    far: boolean,
    height: (x: number, z: number) => number,
  ): TreeBatch | undefined {
    const id = `${key}/${Number(far)}`,
      found = this.entries.get(id);
    if (!found) return;
    this.remove(id); // Ownership moves to pending; never count or retain it twice.
    const { entry } = found;
    if (entry.signature === signature && entry.batch.anchors.every((p) => p.y === height(p.x, p.z)))
      return entry.batch;
  }
  prune(signatures: ReadonlyMap<string, { signature: string }>): void {
    for (const [id, value] of this.entries)
      if (signatures.get(value.key)?.signature !== value.entry.signature) this.remove(id);
  }
  usage() {
    return { entries: this.entries.size, bytes: this.bytes, limit: this.limit };
  }
  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
  private remove(id: string): void {
    const found = this.entries.get(id);
    if (!found) return;
    this.bytes -= found.bytes;
    this.entries.delete(id);
  }
}
