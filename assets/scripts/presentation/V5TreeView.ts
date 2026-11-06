import { Node, geometry } from 'cc';
import { TreeStreaming } from '../application/TreeStreaming';
import type { WorldViewBounds } from '../application/TreeStreaming';
import type { TreeBatch } from '../art/V5TreeGeometry';
import type { GameState } from '../domain/game';
import { V5ChunkMeshes } from './V5ChunkMeshes';
import { worldMaterial } from './WorldMaterial';
import { nearProjectedBounds } from './TouchPicking';
import type { TouchCandidate, TouchPickContext } from './TouchPicking';
/** Real saved trees are batched by space. Every visible triangle retains its exact tree ID. */
export class V5TreeView {
  private readonly root: Node;
  private readonly material = worldMaterial();
  private readonly entries = new Map<string, V5ChunkMeshes>();
  private staging: { key: string; batch: TreeBatch } | null = null;
  private readonly stream: TreeStreaming;
  constructor(
    parent: Node,
    private readonly groundReady: (x: number, z: number) => boolean = () => true,
  ) {
    this.root = new Node('V5ResourceTrees');
    parent.addChild(this.root);
    this.stream = new TreeStreaming(
      (key, batch) => this.publish(key, batch),
      (key) => this.remove(key),
      (key) => this.cancel(key),
    );
  }
  sync(state: GameState, now: number): void {
    this.stream.sync(state, now);
  }
  get loading(): boolean {
    return this.stream.loading;
  }
  frame(bounds: WorldViewBounds): boolean {
    return this.stream.frame(bounds);
  }
  private publish(key: string, batch: TreeBatch): boolean {
    if (!batch.anchors.every((p) => this.groundReady(p.x, p.z))) return false;
    const restart = this.staging?.key !== key || this.staging.batch !== batch;
    if (restart && this.staging) this.cancel(this.staging.key);
    let meshes = this.entries.get(key);
    if (!meshes) {
      meshes = new V5ChunkMeshes(this.root, this.material);
      this.entries.set(key, meshes);
    }
    if (restart) {
      meshes.stage([{ key, mesh: batch.mesh }]);
      this.staging = { key, batch };
    }
    if (!meshes.advance(262144, 2)) return false;
    meshes.publish();
    this.staging = null;
    return true;
  }
  private cancel(key: string): void {
    const meshes = this.entries.get(key);
    meshes?.cancel();
    if (meshes && !meshes.keys().length) {
      meshes.dispose();
      this.entries.delete(key);
    }
    if (this.staging?.key === key) this.staging = null;
  }
  private remove(key: string): void {
    this.entries.get(key)?.dispose();
    this.entries.delete(key);
    if (this.staging?.key === key) this.staging = null;
  }
  bounds(id: string) {
    for (const [key, surface] of this.stream.surfaces()) if (key === id) return surface.bounds;
    return null;
  }
  pick(ray: geometry.Ray) {
    let result: { id: string; distance: number } | null = null;
    for (const [id, surface] of this.stream.surfaces()) {
      const distance = surface.distance(ray, result?.distance);
      if (
        distance !== null &&
        (!result || distance < result.distance || (distance === result.distance && id < result.id))
      )
        result = { id, distance };
    }
    return result;
  }
  candidates(context: TouchPickContext): TouchCandidate[] {
    const result: TouchCandidate[] = [];
    for (const [id, surface] of this.stream.surfaces())
      if (nearProjectedBounds(surface.bounds, context))
        result.push({
          pick: (ray) => {
            const distance = surface.distance(ray);
            return distance === null ? null : { kind: 'tree', id, distance };
          },
        });
    return result;
  }
  dispose(): void {
    this.stream.dispose();
    for (const meshes of this.entries.values()) meshes.dispose();
    this.entries.clear();
    this.root.destroy();
    this.material.destroy();
  }
}
