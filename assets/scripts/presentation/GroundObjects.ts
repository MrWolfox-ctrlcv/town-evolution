import { ASSETS } from '../art/AssetCatalog';
import { compileAsset } from '../art/MeshCompiler';
import { Node, geometry } from 'cc';
import type { GameState } from '../domain/game';
import { ModelFactory } from './ModelFactory';
import { pileModel } from './PileModel';
/** Resource identity comes from saves; decorative border scenery is never harvestable. */
export class GroundObjects {
  private readonly root: Node;
  private readonly factory = new ModelFactory();
  private signature = '';
  private lifted: string | null = null;
  private piles: Array<{ key: string; x: number; z: number; node: Node; box: geometry.AABB }> = [];
  private trees: Array<{ id: string; box: geometry.AABB }> = [];
  constructor(parent: Node) {
    this.root = new Node('GroundObjects');
    parent.addChild(this.root);
  }
  sync(state: GameState): void {
    const signature = JSON.stringify([state.trees, state.groundStacks]);
    if (signature === this.signature) return;
    this.signature = signature;
    for (const child of [...this.root.children]) child.destroy();
    this.trees = [];
    this.piles = [];
    for (const tree of state.trees) {
      const model = this.factory.asset('tree', `ResourceTree:${tree.id}`);
      model.setPosition(tree.x + 0.5, 0, tree.z + 0.5);
      model.setScale(0.65, 0.8, 0.65);
      this.root.addChild(model);
      this.trees.push({
        id: tree.id,
        box: new geometry.AABB(tree.x + 0.5, 0.8, tree.z + 0.5, 0.5, 0.8, 0.5),
      });
    }
    for (const pile of state.groundStacks) {
      const key = `pile:${pile.x}:${pile.z}`;
      const node = pileModel(this.factory, pile, key);
      this.root.addChild(node);
      node.active = this.lifted !== key;
      const bounds = compileAsset(ASSETS[`pile-${pile.item}-${pile.amount}`]!);
      this.piles.push({
        key,
        x: pile.x,
        z: pile.z,
        node,
        box: new geometry.AABB(
          pile.x + 0.5 + (bounds.min[0]! + bounds.max[0]!) / 2,
          0.024 + (bounds.min[1]! + bounds.max[1]!) / 2,
          pile.z + 0.5 + (bounds.min[2]! + bounds.max[2]!) / 2,
          Math.max(0.2, (bounds.max[0]! - bounds.min[0]!) / 2),
          Math.max(0.1, (bounds.max[1]! - bounds.min[1]!) / 2),
          Math.max(0.2, (bounds.max[2]! - bounds.min[2]!) / 2),
        ),
      });
    }
  }
  setLifted(key: string | null): void {
    this.lifted = key;
    for (const pile of this.piles) pile.node.active = pile.key !== key;
  }
  pickStack(ray: geometry.Ray, exclude?: string) {
    let nearest: { id: string; x: number; z: number; distance: number } | null = null;
    for (const pile of this.piles) {
      if (pile.key === exclude || pile.key === this.lifted) continue;
      const distance = geometry.intersect.rayAABB(ray, pile.box);
      if (distance > 0 && (!nearest || distance < nearest.distance))
        nearest = { id: pile.key, x: pile.x, z: pile.z, distance };
    }
    return nearest;
  }
  pickTree(ray: geometry.Ray): { id: string; distance: number } | null {
    let id: string | null = null,
      distance = Infinity;
    for (const tree of this.trees) {
      const hit = geometry.intersect.rayAABB(ray, tree.box);
      if (hit > 0 && hit < distance) {
        distance = hit;
        id = tree.id;
      }
    }
    return id ? { id, distance } : null;
  }
  dispose(): void {
    this.root.destroy();
    this.factory.dispose();
  }
}
