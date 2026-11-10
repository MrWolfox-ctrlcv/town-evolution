import { Node, geometry } from 'cc';
import { dropPosition } from '../domain/game';
import type { GameState } from '../domain/game';
import { dropShape, dropRect } from '../application/DropGeometry';
import { modelBounds } from './ObjectBounds';
import { ModelFactory } from './ModelFactory';
import { ModelPicking } from './ModelPicking';
import type { DropSupport } from './DropSupport';
import type { TouchCandidate, TouchPickContext } from './TouchPicking';
/** Persisted drop IDs remain separate from manually placed integer-tile piles. */
export class LooseDropView {
  private readonly root: Node;
  private readonly factory = new ModelFactory();
  private entries = new Map<
    string,
    { node: Node; surface: ModelPicking; signature: string; ready: boolean }
  >();
  private key = '';
  private lifted: string | null = null;
  setLifted(id: string | null): void {
    this.lifted = id;
    for (const [key, entry] of this.entries) entry.node.active = key !== id && entry.ready;
  }
  constructor(
    parent: Node,
    private readonly groundReady: (x: number, z: number) => boolean = () => true,
  ) {
    this.root = new Node('LooseDrops');
    parent.addChild(this.root);
  }
  sync(state: GameState, support: DropSupport): void {
    const key = JSON.stringify([support.revision, state.looseDrops]);
    if (key === this.key) return;
    this.key = key;
    const old = new Map(this.entries);
    this.entries.clear();
    for (const drop of state.looseDrops) {
      const shape = dropShape(drop),
        { asset } = shape,
        p = dropPosition(drop),
        rect = dropRect(drop);
      const height = support.height({
        minX: rect.x,
        maxX: rect.x + rect.width,
        minZ: rect.z,
        maxZ: rect.z + rect.depth,
      });
      // A missing support is visible and recoverable, never deleted or moved to another tile.
      const y = (height ?? 0.022) + 0.008 - shape.minY * shape.scale;
      const ready =
        (state.terrainVersion !== 6 && state.terrainVersion !== 7) ||
        (height !== null && this.groundReady(Math.floor(p.x), Math.floor(p.z)));
      const signature = `${asset}:${p.x}:${p.z}:${y}:${ready}`;
      const prior = old.get(drop.id);
      old.delete(drop.id);
      if (prior?.signature === signature) {
        this.entries.set(drop.id, prior);
        continue;
      }
      prior?.node.destroy();
      const node = new Node(`Drop:${drop.id}`),
        model = this.factory.asset(asset, 'DroppedGoods');
      node.setPosition(p.x, y, p.z);
      model.setPosition(-shape.x * shape.scale, 0, -shape.z * shape.scale);
      model.setScale(shape.scale, shape.scale, shape.scale);
      node.addChild(model);
      this.root.addChild(node);
      node.active = drop.id !== this.lifted && ready;
      this.entries.set(drop.id, { node, surface: new ModelPicking(node), signature, ready });
    }
    for (const entry of old.values()) entry.node.destroy();
  }
  pick(ray: geometry.Ray) {
    let hit: { id: string; distance: number } | null = null;
    for (const [id, entry] of this.entries) {
      const distance = entry.surface.distance(ray, hit?.distance);
      if (
        distance !== null &&
        (!hit || distance < hit.distance || (distance === hit.distance && id < hit.id))
      )
        hit = { id, distance };
    }
    return hit;
  }
  bounds(id: string) {
    const entry = this.entries.get(id);
    return entry ? modelBounds(entry.node) : null;
  }
  origin(id: string) {
    return this.entries.get(id)?.node.position ?? null;
  }
  candidates(context: TouchPickContext): TouchCandidate[] {
    const candidates: TouchCandidate[] = [];
    for (const [id, entry] of this.entries)
      if (entry.surface.nearScreen(context))
        candidates.push({
          pick: (ray) => {
            const distance = entry.surface.distance(ray);
            return distance === null ? null : { kind: 'drop', id, distance };
          },
        });
    return candidates;
  }
  dispose(): void {
    this.root.destroy();
    this.entries.clear();
    this.factory.dispose();
  }
}
