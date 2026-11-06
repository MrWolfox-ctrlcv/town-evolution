import { Node, MeshRenderer, Mesh, Material } from 'cc';
import type { MeshData } from '../art/AssetTypes';
import { iterateV6UploadParts, v6MeshBytes } from '../art/V6MeshUploadParts';
import { worldMesh } from './WorldMesh';
import { worldShadows } from './WorldMaterial';
interface Entry {
  nodes: Node[];
  meshes: Mesh[];
}
/** Hidden, atomic v6 uploads. Byte budgets include all actual Cocos vertex attributes,
 * generated UV0 and R16UI indices. Millisecond budgets remain soft, never a GPU latency claim. */
export class V6ChunkMeshes {
  private live = new Map<string, Entry>();
  private pending: Array<{
    key: string;
    parts: Generator<MeshData>;
    current: MeshData | null;
    done: boolean;
    entry: Entry;
    index: number;
  }> | null = null;
  constructor(
    private parent: Node,
    private material: Material,
    private shadows = true,
  ) {}
  stage(changes: readonly { key: string; mesh: MeshData }[]): void {
    if (new Set(changes.map((change) => change.key)).size !== changes.length)
      throw Error('Duplicate v6 upload key');
    this.cancel();
    this.pending = changes.map((c) => ({
      key: c.key,
      parts: iterateV6UploadParts(c.mesh),
      current: null,
      done: false,
      entry: { nodes: [], meshes: [] },
      index: 0,
    }));
  }
  advance(maxBytes = 262144, maxMilliseconds = 3): boolean {
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
        while (!p.done) {
          if (spent >= maxBytes || performance.now() - start >= maxMilliseconds) return false;
          if (!p.current) {
            const next = p.parts.next();
            if (next.done) {
              p.done = true;
              break;
            }
            p.current = next.value;
          }
          const part = p.current,
            bytes = v6MeshBytes(part);
          if (spent + bytes > maxBytes || performance.now() - start >= maxMilliseconds)
            return false;
          const mesh = worldMesh(part);
          p.entry.meshes.push(mesh);
          const node = new Node(`V6Chunk:${p.key}:${p.index}`);
          p.entry.nodes.push(node);
          node.active = false;
          node.layer = this.parent.layer;
          this.parent.addChild(node);
          const renderer = node.addComponent(MeshRenderer);
          renderer.setMaterial(this.material, 0);
          renderer.mesh = mesh;
          worldShadows(renderer, this.shadows);
          p.index++;
          p.current = null;
          spent += bytes;
        }
    } catch (error) {
      this.cancel();
      throw error;
    }
    return true;
  }
  publish(): void {
    if (!this.pending || this.pending.some((p) => !p.done))
      throw Error('Incomplete v6 upload group');
    const next = new Map(this.live),
      old: Entry[] = [];
    for (const p of this.pending) {
      const previous = next.get(p.key);
      if (previous) old.push(previous);
      if (p.entry.nodes.length) next.set(p.key, p.entry);
      else next.delete(p.key);
    }
    for (const p of this.pending) for (const node of p.entry.nodes) node.active = true;
    for (const e of old) for (const node of e.nodes) node.active = false;
    this.live = next;
    this.pending = null;
    for (const e of old) this.release(e);
  }
  private release(entry: Entry): void {
    for (const n of entry.nodes) {
      n.removeFromParent();
      n.destroy();
    }
    for (const m of entry.meshes) m.destroy();
  }
  cancel(): void {
    if (this.pending)
      for (const p of this.pending) {
        p.parts.return(undefined);
        this.release(p.entry);
      }
    this.pending = null;
  }
  dispose(): void {
    this.cancel();
    for (const e of this.live.values()) this.release(e);
    this.live.clear();
  }
  keys(): readonly string[] {
    return [...this.live.keys()];
  }
}
