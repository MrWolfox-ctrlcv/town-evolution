import { attachmentModel } from './PileModel';
import { TownFeedback } from './TownFeedback';
import { IslandView } from './IslandView';
import { Node, geometry } from 'cc';
import { CONFIG, footprint } from '../domain/game';
import type { Building, GameState } from '../domain/game';
import { GroundObjects } from './GroundObjects';
import { ModelFactory } from './ModelFactory';
import { farmVisuals } from '../art/FarmCellKit';
import { pickFarmCrop } from '../application/FarmPicking';
export interface PlacementPreview {
  kind: 'farm' | 'warehouse' | 'cooler' | 'shop' | 'orderBoard' | 'dock';
  x: number;
  z: number;
  valid: boolean;
}
/** Incremental renderer: static terrain stays alive and only changed buildings are rebuilt. */
export class TownView {
  private readonly factory = new ModelFactory();
  private island!: IslandView;
  private readonly root: Node;
  private readonly resources: GroundObjects;
  private readonly buildings = new Map<string, { signature: string; node: Node }>();
  private readonly feedback: TownFeedback;
  private previous: GameState | null = null;
  private marker: Node | null = null;
  private markerKey = '';
  private lifted: string | null = null;
  private pickBoxes: Array<{ id: string; bounds: geometry.AABB }> = [];
  constructor(parent: Node) {
    this.root = new Node('TownWorld');
    parent.addChild(this.root);
    this.feedback = this.root.addComponent(TownFeedback);
    this.feedback.configure(this.factory);
    this.terrain();
    this.resources = new GroundObjects(this.root);
  }
  sync(
    state: GameState,
    selection: string | null,
    preview: PlacementPreview | null,
    now = Date.now(),
  ): void {
    const previous = this.previous;
    if (previous && previous.mapSeed === state.mapSeed) {
      const trees = new Set(state.trees.map((tree) => tree.id));
      for (const tree of previous.trees)
        if (!trees.has(tree.id)) this.feedback.chop(tree.x, tree.z);
      for (const pile of state.groundStacks) {
        const old = previous.groundStacks.find(
          (p) => p.x === pile.x && p.z === pile.z && p.item === pile.item,
        );
        if (!old || old.amount !== pile.amount) this.feedback.stack(pile.x, pile.z);
      }
    } else if (previous) this.feedback.clear();
    this.previous = state;
    this.island.sync(state);
    this.resources.sync(state);
    const effectiveNow = Math.max(now, state.lastSeenAt);
    this.pickBoxes = state.buildings.map((b) => {
      const f = footprint(b);
      const h =
        b.kind === 'farm'
          ? 0.6
          : b.kind === 'orderBoard'
            ? 1.4
            : b.kind === 'dock'
              ? 1.3
              : b.kind === 'cooler'
                ? 1
                : b.kind === 'expandedWarehouse'
                  ? 2.3
                  : 2;
      return {
        id: b.id,
        bounds: new geometry.AABB(
          b.x + f.width / 2,
          h / 2,
          b.z + f.depth / 2,
          f.width / 2,
          h / 2,
          f.depth / 2,
        ),
      };
    });
    const live = new Set(state.buildings.map((b) => b.id));
    for (const [id, entry] of this.buildings)
      if (!live.has(id)) {
        entry.node.destroy();
        this.buildings.delete(id);
      }
    for (const b of state.buildings) {
      const signature = [
        state.mapSeed,
        b.kind,
        b.x,
        b.z,
        b.rotation,
        JSON.stringify(state.fusion.attachments[b.id] ?? {}),
        b.kind === 'farm' ? farmVisuals(b.cropJobs, effectiveNow).join(',') : Boolean(b.job),
      ].join(':');
      const old = this.buildings.get(b.id);
      if (old?.signature === signature) continue;
      old?.node.destroy();
      const node = this.factory.building(b, effectiveNow, state.mapSeed);
      this.root.addChild(node);
      const stock = state.fusion.attachments[b.id];
      if (stock) {
        const materials = attachmentModel(this.factory, stock, b.kind);
        materials.setRotationFromEuler(0, b.rotation * 90, 0);
        node.addChild(materials);
      }
      const before = previous?.buildings.find((entry) => entry.id === b.id);
      if (
        previous &&
        previous.mapSeed === state.mapSeed &&
        (!before ||
          before.kind !== b.kind ||
          JSON.stringify(previous.fusion.attachments[b.id]) !==
            JSON.stringify(state.fusion.attachments[b.id]))
      )
        this.feedback.construct(node, b);
      node.active = b.id !== this.lifted;
      this.buildings.set(b.id, { signature, node });
    }
    const selected = state.buildings.find((b) => b.id === selection);
    const key = preview
      ? JSON.stringify(preview)
      : selected
        ? `${selected.id}:${selected.kind}:${selected.x}:${selected.z}:${selected.rotation}`
        : '';
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.marker?.destroy();
    this.marker = null;
    if (preview) this.outline(preview, preview.valid ? '#EFD377' : '#D87163');
    else if (selected) this.outline(selected, '#F3D37C');
  }
  setLifted(id: string | null): void {
    this.lifted = id;
    for (const [key, entry] of this.buildings) entry.node.active = key !== id;
  }
  pickBuilding(ray: geometry.Ray, excludeId?: string): string | null {
    let distance = Infinity;
    let id: string | null = null;
    for (const entry of this.pickBoxes) {
      if (entry.id === excludeId || entry.id === this.lifted) continue;
      const hit = geometry.intersect.rayAABB(ray, entry.bounds);
      if (hit > 0 && hit < distance) {
        distance = hit;
        id = entry.id;
      }
    }
    const tree = this.resources.pickTree(ray);
    const pile = this.resources.pickStack(ray);
    return (tree && tree.distance < distance) || (pile && pile.distance < distance) ? null : id;
  }
  pickCrop(ray: geometry.Ray, state = this.previous) {
    if (!state) return null;
    const hit = pickFarmCrop(state.buildings, ray, Math.max(Date.now(), state.lastSeenAt));
    if (!hit || hit.buildingId === this.lifted) return null;
    for (const entry of this.pickBoxes) {
      if (state.buildings.find((b) => b.id === entry.id)?.kind === 'farm') continue;
      const distance = geometry.intersect.rayAABB(ray, entry.bounds);
      if (distance > 0 && distance < hit.distance) return null;
    }
    const tree = this.resources.pickTree(ray),
      pile = this.resources.pickStack(ray);
    if ((tree && tree.distance < hit.distance) || (pile && pile.distance < hit.distance))
      return null;
    return hit;
  }
  private outline(
    b: Pick<Building, 'kind' | 'x' | 'z'> & { rotation?: Building['rotation'] },
    shade: string,
  ): void {
    const dimensions = footprint({ kind: b.kind, rotation: b.rotation ?? 0 });
    const w = dimensions.width,
      d = dimensions.depth;
    this.marker = new Node('PlacementOutline');
    this.root.addChild(this.marker);
    this.marker.setPosition(b.x + w / 2, 0, b.z + d / 2);
    this.factory.shape(this.marker, 'North', 0, 0.09, -d / 2, w + 0.1, 0.09, 0.1, shade);
    this.factory.shape(this.marker, 'South', 0, 0.09, d / 2, w + 0.1, 0.09, 0.1, shade);
    this.factory.shape(this.marker, 'West', -w / 2, 0.09, 0, 0.1, 0.09, d, shade);
    this.factory.shape(this.marker, 'East', w / 2, 0.09, 0, 0.1, 0.09, d, shade);
  }
  private terrain(): void {
    this.island = new IslandView(this.root, CONFIG.gridSize);
  }
  setLiftedStack(id: string | null): void {
    this.resources.setLifted(id);
  }
  pickStack(ray: geometry.Ray, exclude?: string) {
    const pile = this.resources.pickStack(ray, exclude);
    if (!pile) return null;
    const tree = this.resources.pickTree(ray);
    if (tree && tree.distance < pile.distance) return null;
    for (const building of this.pickBoxes) {
      if (building.id === this.lifted) continue;
      const hit = geometry.intersect.rayAABB(ray, building.bounds);
      if (hit > 0 && hit < pile.distance) return null;
    }
    return pile;
  }
  pickTree(ray: geometry.Ray): string | null {
    const tree = this.resources.pickTree(ray);
    if (!tree) return null;
    const pile = this.resources.pickStack(ray);
    if (pile && pile.distance < tree.distance) return null;
    for (const building of this.pickBoxes) {
      if (building.id === this.lifted) continue;
      const hit = geometry.intersect.rayAABB(ray, building.bounds);
      if (hit > 0 && hit < tree.distance) return null;
    }
    return tree.id;
  }
  dispose(): void {
    this.feedback.clear();
    this.previous = null;
    this.resources.dispose();
    this.island.dispose();
    this.root.active = false;
    this.root.destroy();
    this.factory.dispose();
  }
}
