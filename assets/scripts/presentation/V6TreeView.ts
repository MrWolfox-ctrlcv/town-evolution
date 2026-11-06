import { Node, geometry } from 'cc';
import { V6TreeStreaming as TreeStreaming } from '../application/V6TreeStreaming';
import type { WorldViewBounds } from '../application/TreeStreaming';
import type { TreeBatch } from '../art/V6TreeGeometry';
import type { GameState } from '../domain/game';
import { V6ChunkMeshes } from './V6ChunkMeshes';
import { worldMaterial } from './WorldMaterial';
import { nearProjectedBounds } from './TouchPicking';
import type { TouchCandidate, TouchPickContext } from './TouchPicking';
/** Real saved trees are batched by space. Every visible triangle retains its exact tree ID. */
export class V6TreeView {
  private readonly root: Node;
  private readonly material = worldMaterial();
  private readonly entries = new Map<string, V6ChunkMeshes>();
  private staging: { key: string; batch: TreeBatch } | null = null;
  private readonly stream: TreeStreaming;
  private owners = new Map<string, { x: number; z: number }>();
  constructor(
    parent: Node,
    private readonly groundReady: (x: number, z: number) => boolean,
    height: (x: number, z: number) => number,
    private readonly groundVisible = groundReady,
  ) {
    this.root = new Node('V6ResourceTrees');
    parent.addChild(this.root);
    this.stream = new TreeStreaming(
      (key, batch, bytes, ms) => this.publish(key, batch, bytes, ms),
      (key) => this.remove(key),
      (key) => this.cancel(key),
      height,
    );
  }
  sync(state: GameState, now: number): void {
    this.owners = new Map(state.trees.map((t) => [t.id, t]));
    this.stream.sync(state, now);
  }
  get loading(): boolean {
    return this.stream.loading;
  }
  frame(bounds: WorldViewBounds, lodSpan?: number): boolean {
    return this.stream.frame(bounds, lodSpan === undefined ? {} : { lodSpan });
  }
  private publish(key: string, batch: TreeBatch, bytes: number, ms: number): boolean {
    if (!batch.anchors.every((p) => this.groundVisible(p.x, p.z))) return false;
    const restart = this.staging?.key !== key || this.staging.batch !== batch;
    if (restart && this.staging) this.cancel(this.staging.key);
    let meshes = this.entries.get(key);
    if (!meshes) {
      meshes = new V6ChunkMeshes(this.root, this.material);
      this.entries.set(key, meshes);
    }
    if (restart) {
      meshes.stage([{ key, mesh: batch.mesh }]);
      this.staging = { key, batch };
    }
    if (!meshes.advance(bytes, ms)) return false;
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
  isReady(id: string): boolean {
    const owner = this.owners.get(id);
    return !!owner && this.groundReady(owner.x, owner.z);
  }
  pick(ray: geometry.Ray, includeBlocked = false) {
    let result: { id: string; distance: number } | null = null;
    for (const [id, surface] of this.stream.surfaces()) {
      const distance = surface.distance(ray, result?.distance);
      if (
        distance !== null &&
        (!result || distance < result.distance || (distance === result.distance && id < result.id))
      )
        result = { id, distance };
    }
    return result && (includeBlocked || this.isReady(result.id)) ? result : null;
  }
  candidates(context: TouchPickContext, includeBlocked = false): TouchCandidate[] {
    const result: TouchCandidate[] = [];
    for (const [id, surface] of this.stream.surfaces())
      if (nearProjectedBounds(surface.bounds, context))
        result.push({
          pick: (ray) => {
            const owner = this.owners.get(id);
            if (!includeBlocked && (!owner || !this.groundReady(owner.x, owner.z))) return null;
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
