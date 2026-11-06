import { V5TreeView } from './V5TreeView';
import type { WorldViewBounds } from '../application/TreeStreaming';
import { modelBounds } from './ObjectBounds';
import type { ObjectTarget } from '../application/ObjectSelection';
import type { NaturalSurfaceData } from '../art/NaturalSurfaceData';
import { NaturalPicking } from '../application/NaturalPicking';
import { resourceTreeVisual } from '../art/TreeKit';
import { Node, geometry } from 'cc';
import { treeGrowthProgress, type GameState } from '../domain/game';
import { ModelFactory } from './ModelFactory';
import { ModelPicking } from './ModelPicking';
import { pileModel } from './PileModel';
import { nearProjectedBounds } from './TouchPicking';
import { LooseDropView } from './LooseDropView';
import type { DropSupport } from './DropSupport';
import type { TouchCandidate, TouchPickContext } from './TouchPicking';
/** Resource identity comes from saves; decorative border scenery is never harvestable. */
export class GroundObjects {
  private readonly root: Node;
  private drops: LooseDropView | null = null;
  private v5Trees: V5TreeView | null = null;
  private readonly factory = new ModelFactory();
  private signature = '';
  private lifted: string | null = null;
  private piles: Array<{
    key: string;
    x: number;
    z: number;
    signature: string;
    node: Node;
    surface: ModelPicking;
  }> = [];
  private trees: Array<{ id: string; signature: string; node: Node; surface: ModelPicking }> = [];
  private readonly natural = new NaturalPicking();
  constructor(
    parent: Node,
    private readonly groundReady: (x: number, z: number) => boolean = () => true,
  ) {
    this.root = new Node('GroundObjects');
    parent.addChild(this.root);
  }
  sync(
    state: GameState,
    surface: NaturalSurfaceData = { positions: [], resources: [] },
    now = Date.now(),
    support?: DropSupport,
  ): void {
    if (support) {
      this.drops ??= new LooseDropView(this.root);
      this.drops.sync(state, support);
    }
    if (state.terrainVersion === 5) {
      this.v5Trees ??= new V5TreeView(this.root, this.groundReady);
      this.v5Trees.sync(state, now);
    } else if (this.v5Trees) {
      this.v5Trees.dispose();
      this.v5Trees = null;
    }
    const trees = state.terrainVersion === 5 ? [] : state.trees;
    const stages = trees.map((tree) =>
      Math.floor(treeGrowthProgress(tree, Math.max(now, state.lastSeenAt)) * 3),
    );
    this.natural.sync(surface, state.naturalResources);
    const signature = JSON.stringify([state.mapSeed, trees, stages, state.groundStacks]);
    if (signature === this.signature) return;
    this.signature = signature;
    // Quantity changes and chopping must not rebuild every other tree and its picker.
    const oldTrees = new Map(this.trees.map((tree) => [tree.id, tree]));
    this.trees = trees.map((tree, index) => {
      const stage = stages[index]!;
      const signature = `${state.mapSeed}:${tree.x}:${tree.z}:${stage}`;
      const old = oldTrees.get(tree.id);
      oldTrees.delete(tree.id);
      if (old?.signature === signature) return old;
      old?.node.destroy();
      const { asset, scale, yaw } = resourceTreeVisual(state.mapSeed, tree.x, tree.z);
      const model = this.factory.asset(stage < 3 ? 'sapling' : asset, `ResourceTree:${tree.id}`);
      model.setPosition(tree.x + 0.5, 0, tree.z + 0.5);
      if (stage < 3) model.setScale(1 + stage * 0.4, 1 + stage * 0.5, 1 + stage * 0.4);
      else model.setScale(...scale);
      model.setRotationFromEuler(0, yaw, 0);
      this.root.addChild(model);
      return {
        id: tree.id,
        signature,
        node: model,
        surface: new ModelPicking(model),
      };
    });
    for (const tree of oldTrees.values()) tree.node.destroy();
    const oldPiles = new Map(this.piles.map((pile) => [pile.key, pile]));
    this.piles = state.groundStacks.map((pile) => {
      const key = `pile:${pile.x}:${pile.z}`;
      const signature = `${pile.item}:${pile.amount}`;
      const old = oldPiles.get(key);
      oldPiles.delete(key);
      if (old?.signature === signature) return old;
      old?.node.destroy();
      const node = pileModel(this.factory, pile, key);
      this.root.addChild(node);
      node.active = this.lifted !== key;
      return {
        key,
        x: pile.x,
        z: pile.z,
        signature,
        node,
        surface: new ModelPicking(node),
      };
    });
    for (const pile of oldPiles.values()) pile.node.destroy();
  }
  get loading(): boolean {
    return this.v5Trees?.loading ?? false;
  }
  frame(bounds: WorldViewBounds): boolean {
    return this.v5Trees?.frame(bounds) ?? false;
  }
  objectBounds(target: ObjectTarget) {
    if (target.kind === 'tree' && this.v5Trees) return this.v5Trees.bounds(target.id);
    if (target.kind === 'drop') return this.drops?.bounds(target.id) ?? null;
    if (target.kind === 'natural') return this.natural.bounds(target.id);
    const node =
      target.kind === 'tree'
        ? this.trees.find((t) => t.id === target.id)?.node
        : target.kind === 'pile'
          ? this.piles.find((p) => p.x === target.x && p.z === target.z)?.node
          : null;
    return node ? modelBounds(node) : null;
  }
  setLifted(key: string | null): void {
    this.lifted = key;
    for (const pile of this.piles) pile.node.active = pile.key !== key;
  }
  pickStack(ray: geometry.Ray, exclude?: string) {
    let nearest: { id: string; x: number; z: number; distance: number } | null = null;
    for (const pile of this.piles) {
      if (pile.key === exclude || pile.key === this.lifted) continue;
      const distance = pile.surface.distance(ray, nearest?.distance);
      if (
        distance !== null &&
        (!nearest ||
          distance < nearest.distance ||
          (distance === nearest.distance && pile.key < nearest.id))
      )
        nearest = { id: pile.key, x: pile.x, z: pile.z, distance };
    }
    return nearest;
  }
  pickNatural(ray: geometry.Ray) {
    return this.natural.pick(ray);
  }
  touchCandidates(context: TouchPickContext, exclude?: string): TouchCandidate[] {
    const result: TouchCandidate[] = [
      ...(this.drops?.candidates(context) ?? []),
      ...(this.v5Trees?.candidates(context) ?? []),
    ];
    for (const tree of this.trees)
      if (tree.surface.nearScreen(context))
        result.push({
          pick: (ray) => {
            const distance = tree.surface.distance(ray);
            return distance === null ? null : { kind: 'tree', id: tree.id, distance };
          },
        });
    for (const pile of this.piles)
      if (pile.key !== exclude && pile.key !== this.lifted && pile.surface.nearScreen(context))
        result.push({
          pick: (ray) => {
            const distance = pile.surface.distance(ray);
            return distance === null
              ? null
              : { kind: 'pile', id: pile.key, x: pile.x, z: pile.z, distance };
          },
        });
    const natural = this.natural.subset((bounds) => nearProjectedBounds(bounds, context));
    result.push({
      pick: (ray) => {
        const hit = natural.pick(ray);
        return hit ? { kind: 'natural', ...hit } : null;
      },
    });
    return result;
  }
  setLiftedDrop(id: string | null): void {
    this.drops?.setLifted(id);
  }
  pickDrop(ray: geometry.Ray) {
    return this.drops?.pick(ray) ?? null;
  }
  dropOrigin(id: string) {
    return this.drops?.origin(id) ?? null;
  }
  naturalOrigin(id: string) {
    return this.natural.origin(id);
  }
  pickTree(ray: geometry.Ray): { id: string; distance: number } | null {
    if (this.v5Trees) return this.v5Trees.pick(ray);
    let id: string | null = null,
      distance = Infinity;
    for (const tree of this.trees) {
      const hit = tree.surface.distance(ray, distance);
      if (hit !== null && (hit < distance || (hit === distance && (id === null || tree.id < id)))) {
        distance = hit;
        id = tree.id;
      }
    }
    return id ? { id, distance } : null;
  }
  dispose(): void {
    this.drops?.dispose();
    this.v5Trees?.dispose();
    this.root.destroy();
    this.factory.dispose();
  }
}
