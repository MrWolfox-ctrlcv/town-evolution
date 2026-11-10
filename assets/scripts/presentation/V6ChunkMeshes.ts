import { Node, MeshRenderer, Mesh, Material } from 'cc';
import type { MeshData } from '../art/AssetTypes';
import { iterateV6UploadParts, v6MeshBytes } from '../art/V6MeshUploadParts';
import { v6RenderBatches } from '../art/V6RenderBatches';
import { worldMesh } from './WorldMesh';
import { worldShadows } from './WorldMaterial';
interface Entry {
  complete: boolean;
  nodes: Node[];
  meshes: Mesh[];
}
interface PendingBatch {
  parts: Generator<MeshData> | null;
  current: MeshData | null;
  done: boolean;
  token: object;
  entry: Entry;
}
/** Hidden, atomic v6 uploads. Pool entries own GPU objects only, never CPU snapshots.
 * Live chunks, the bounded CPU cache and the pending transaction share batch tokens. */
export class V6ChunkMeshes {
  lastAdvanceBytes = 0;
  private live = new Map<string, readonly PendingBatch['token'][]>();
  private entries = new Map<object, Entry>();
  private retained: ReadonlySet<object> = new Set();
  private pending: Array<{ key: string; batches: PendingBatch[] }> | null = null;
  constructor(
    private parent: Node,
    private material: Material,
    private shadows = true,
  ) {}
  stage(changes: readonly { key: string; mesh: MeshData }[]): void {
    if (new Set(changes.map((change) => change.key)).size !== changes.length)
      throw Error('Duplicate v6 upload key');
    this.cancel();
    this.pending = [];
    try {
      for (const c of changes) {
        const batches: PendingBatch[] = [];
        this.pending.push({ key: c.key, batches });
        for (const batch of v6RenderBatches(c.mesh)) {
          const existing = this.entries.get(batch.token),
            entry = existing ?? { complete: false, nodes: [], meshes: [] };
          this.entries.set(batch.token, entry);
          batches.push({
            token: batch.token,
            entry,
            parts: existing ? null : iterateV6UploadParts(c.mesh, undefined, batch.ranges),
            current: null,
            done: !!existing,
          });
        }
      }
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  /** Terrain's bounded CPU cache is the sole owner of inactive GPU retention. */
  retain(meshes: ReadonlySet<MeshData>): void {
    this.retained = new Set(
      [...meshes].flatMap((mesh) => v6RenderBatches(mesh).map((b) => b.token)),
    );
    this.collect();
  }
  advance(maxBytes = 262144, maxMilliseconds = 3): boolean {
    this.lastAdvanceBytes = 0;
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 0 ||
      Number.isNaN(maxMilliseconds) ||
      maxMilliseconds < 0
    )
      throw Error('Invalid v6 upload budget');
    if (!this.pending) return false;
    const start = performance.now();
    let spent = 0;
    try {
      for (const p of this.pending)
        for (const b of p.batches)
          while (!b.done) {
            if (spent >= maxBytes || performance.now() - start >= maxMilliseconds) return false;
            if (!b.current) {
              const next = b.parts!.next();
              if (next.done) {
                b.done = true;
                b.entry.complete = true;
                b.parts = null;
                break;
              }
              b.current = next.value;
            }
            const part = b.current,
              bytes = v6MeshBytes(part);
            if (spent + bytes > maxBytes || performance.now() - start >= maxMilliseconds)
              return false;
            const mesh = worldMesh(part);
            b.entry.meshes.push(mesh);
            const node = new Node(`V6Chunk:${p.key}:${b.entry.nodes.length}`);
            b.entry.nodes.push(node);
            node.active = false;
            node.layer = this.parent.layer;
            this.parent.addChild(node);
            const renderer = node.addComponent(MeshRenderer);
            renderer.setMaterial(this.material, 0);
            renderer.mesh = mesh;
            worldShadows(renderer, this.shadows);
            b.current = null;
            spent += bytes;
            this.lastAdvanceBytes = spent;
          }
    } catch (error) {
      this.cancel();
      throw error;
    }
    return true;
  }
  publish(): void {
    if (!this.pending || this.pending.some((p) => p.batches.some((b) => !b.done)))
      throw Error('Incomplete v6 upload group');
    const next = new Map(this.live);
    for (const p of this.pending) {
      const tokens = p.batches.filter((b) => b.entry.nodes.length).map((b) => b.token);
      if (tokens.length) next.set(p.key, tokens);
      else next.delete(p.key);
    }
    // Resolve visibility against the entire next snapshot. A reused live batch
    // must never be hidden or destroyed when its old chunk snapshot is replaced.
    const active = new Set([...next.values()].flat());
    for (const [token, entry] of this.entries)
      for (const node of entry.nodes) node.active = active.has(token);
    this.live = next;
    this.pending = null;
    this.collect();
  }
  private collect(): void {
    const owned = new Set([...this.retained, ...[...this.live.values()].flat()]);
    for (const p of this.pending ?? []) for (const b of p.batches) owned.add(b.token);
    for (const [token, entry] of this.entries)
      if (
        !owned.has(token) ||
        (!entry.complete && !this.pending?.some((p) => p.batches.some((b) => b.token === token)))
      ) {
        this.entries.delete(token);
        for (const n of entry.nodes) {
          n.removeFromParent();
          n.destroy();
        }
        for (const m of entry.meshes) m.destroy();
      }
  }
  cancel(): void {
    if (this.pending)
      for (const p of this.pending)
        for (const b of p.batches) {
          b.parts?.return(undefined);
          b.parts = null;
          b.current = null;
        }
    this.pending = null;
    this.collect();
  }
  dispose(): void {
    this.cancel();
    this.live.clear();
    this.retained = new Set();
    this.collect();
  }
  keys(): readonly string[] {
    return [...this.live.keys()];
  }
}
