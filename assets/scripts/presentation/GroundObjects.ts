import { pickGroundTree } from './GroundTreePicking';
import { V5TreeView } from './V5TreeView';
import { V6TreeView } from './V6TreeView';
import { getV6EditSurface } from '../domain/v6-edit-surface';
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
import type { TouchCandidate, TouchPickContext, VisibleHit } from './TouchPicking';
/** Resource identity comes from saves; decorative border scenery is never harvestable. */
export class GroundObjects {
  private readonly root: Node;
  private drops: LooseDropView | null = null;
  private v5Trees: V5TreeView | V6TreeView | null = null;
  private treeVersion = 0;
  private v6Surface: ReturnType<typeof getV6EditSurface> | null = null;
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
    ready: boolean;
  }> = [];
  private trees: Array<{ id: string; signature: string; node: Node; surface: ModelPicking }> = [];
  private readonly natural = new NaturalPicking();
  constructor(
    parent: Node,
    private readonly groundReady: (x: number, z: number) => boolean = () => true,
    private readonly groundVisible: (x: number, z: number) => boolean = groundReady,
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
      this.drops ??= new LooseDropView(this.root, this.groundReady);
      this.drops.sync(state, support);
    }
    if (state.terrainVersion === 6 || state.terrainVersion === 7)
      this.v6Surface = getV6EditSurface(state);
    if (state.terrainVersion === 5 || state.terrainVersion === 6 || state.terrainVersion === 7) {
      if (this.treeVersion !== state.terrainVersion) {
        this.v5Trees?.dispose();
        this.v5Trees = null;
        this.treeVersion = state.terrainVersion;
      }
      this.v5Trees ??=
        state.terrainVersion === 6 || state.terrainVersion === 7
          ? new V6TreeView(
              this.root,
              this.groundReady,
              (x, z) => this.v6Surface!.heightInCell(x, z, Math.floor(x), Math.floor(z)),
              this.groundVisible,
            )
          : new V5TreeView(this.root, this.groundReady);
      this.v5Trees.sync(state, now);
    } else {
      this.v5Trees?.dispose();
      this.v5Trees = null;
      this.treeVersion = 0;
      this.v6Surface = null;
    }
    const trees =
      state.terrainVersion === 5 || state.terrainVersion === 6 || state.terrainVersion === 7
        ? []
        : state.trees;
    const stages = trees.map((tree) =>
      Math.floor(treeGrowthProgress(tree, Math.max(now, state.lastSeenAt)) * 3),
    );
    this.natural.sync(surface, state.naturalResources);
    const signature = JSON.stringify([
      state.mapSeed,
      state.terrainVersion,
      state.terrainRevision,
      trees,
      stages,
      state.groundStacks,
      ...(state.terrainVersion === 6 || state.terrainVersion === 7 ? [support?.revision] : []),
    ]);
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
      const elevation =
        state.terrainVersion === 6 || state.terrainVersion === 7
          ? (support?.height({
              minX: pile.x + 0.01,
              minZ: pile.z + 0.01,
              maxX: pile.x + 0.99,
              maxZ: pile.z + 0.99,
            }) ?? null)
          : 0;
      const signature = `${pile.item}:${pile.amount}${state.terrainVersion === 6 || state.terrainVersion === 7 ? ':' + elevation : ''}`;
      const old = oldPiles.get(key);
      oldPiles.delete(key);
      if (old?.signature === signature) return old;
      old?.node.destroy();
      const node = pileModel(this.factory, pile, key);
      this.root.addChild(node);
      if (state.terrainVersion === 6 || state.terrainVersion === 7)
        node.setPosition(node.position.x, (elevation ?? 0) + 0.009, node.position.z);
      node.active = this.lifted !== key && elevation !== null;
      return {
        key,
        x: pile.x,
        z: pile.z,
        signature,
        node,
        surface: new ModelPicking(node),
        ready: elevation !== null,
      };
    });
    for (const pile of oldPiles.values()) pile.node.destroy();
  }
  get loading(): boolean {
    return this.v5Trees?.loading ?? false;
  }
  frame(bounds: WorldViewBounds, lodSpan?: number): boolean {
    return this.v5Trees instanceof V6TreeView
      ? this.v5Trees.frame(bounds, lodSpan)
      : (this.v5Trees?.frame(bounds) ?? false);
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
    for (const pile of this.piles) pile.node.active = pile.key !== key && pile.ready;
  }
  pickStack(ray: geometry.Ray, exclude?: string, includeBlocked = false) {
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
    return nearest && (includeBlocked || this.isUsable({ kind: 'pile', ...nearest }))
      ? nearest
      : null;
  }
  private naturalReady(id: string): boolean {
    if (this.treeVersion !== 6 && this.treeVersion !== 7) return true;
    const owner = this.natural.origin(id);
    return !!owner && this.groundReady(Math.floor(owner.x), Math.floor(owner.z));
  }
  pickNatural(ray: geometry.Ray, includeBlocked = false) {
    const hit = this.natural.pick(ray);
    // Reject the first blocked surface, never search through it for a farther ID.
    return hit && (includeBlocked || this.naturalReady(hit.id)) ? hit : null;
  }
  touchCandidates(
    context: TouchPickContext,
    exclude?: string,
    includeBlocked = false,
  ): TouchCandidate[] {
    const result: TouchCandidate[] = [
      ...(this.drops?.candidates(context) ?? []).map((candidate) => ({
        pick: (ray: geometry.Ray) => {
          const hit = candidate.pick(ray);
          return hit && (includeBlocked || this.isUsable(hit)) ? hit : null;
        },
      })),
      ...(this.v5Trees instanceof V6TreeView
        ? this.v5Trees.candidates(context, includeBlocked)
        : (this.v5Trees?.candidates(context) ?? [])),
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
            if (
              !includeBlocked &&
              (this.treeVersion === 6 || this.treeVersion === 7) &&
              (!pile.ready || !this.groundReady(pile.x, pile.z))
            )
              return null;
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
        return hit && (includeBlocked || this.naturalReady(hit.id))
          ? { kind: 'natural', ...hit }
          : null;
      },
    });
    return result;
  }
  setLiftedDrop(id: string | null): void {
    this.drops?.setLifted(id);
  }
  pickDrop(ray: geometry.Ray, includeBlocked = false) {
    const hit = this.drops?.pick(ray);
    return hit && (includeBlocked || this.isUsable({ kind: 'drop', ...hit })) ? hit : null;
  }
  isUsable(hit: VisibleHit): boolean {
    if (this.treeVersion !== 6 && this.treeVersion !== 7) return true;
    if (hit.kind === 'natural') return this.naturalReady(hit.id);
    if (hit.kind === 'tree')
      return this.v5Trees instanceof V6TreeView && this.v5Trees.isReady(hit.id);
    const p = hit.kind === 'pile' ? hit : hit.kind === 'drop' ? this.drops?.origin(hit.id) : null;
    return !!p && this.groundReady(Math.floor(p.x), Math.floor(p.z));
  }
  stackOrigin(x: number, z: number) {
    return this.piles.find((p) => p.x === x && p.z === z && p.ready)?.node.position ?? null;
  }
  dropOrigin(id: string) {
    return this.drops?.origin(id) ?? null;
  }
  naturalOrigin(id: string) {
    return this.natural.origin(id);
  }
  pickTree(ray: geometry.Ray, includeBlocked = false): { id: string; distance: number } | null {
    if (this.v5Trees instanceof V6TreeView) return this.v5Trees.pick(ray, includeBlocked);
    if (this.v5Trees) return this.v5Trees.pick(ray);
    return pickGroundTree(this.trees, ray);
  }
  dispose(): void {
    this.drops?.dispose();
    this.v5Trees?.dispose();
    this.root.destroy();
    this.factory.dispose();
  }
}
