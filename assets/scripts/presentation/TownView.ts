import type { WorldViewBounds } from '../application/TreeStreaming';
import { buildingOutline } from './BuildingOutline';
import { townChanges } from './TownChanges';
import { TownObjectPicking } from './TownObjectPicking';
import { modelBounds } from './ObjectBounds';
import type { ObjectTarget } from '../application/ObjectSelection';
import { attachmentModel } from './PileModel';
import { TownFeedback } from './TownFeedback';
import { IslandView } from './IslandView';
import { Node, geometry } from 'cc';
import { nurseryStage, processingStage, compostStage } from '../domain/game';
import type { Building, GameState } from '../domain/game';
import { GroundObjects } from './GroundObjects';
import { ModelFactory } from './ModelFactory';
import { ModelPicking } from './ModelPicking';
import { RenderedCropPicking } from './RenderedCropPicking';
import { farmVisuals } from '../art/FarmCellKit';
import { resolveHarvestHit } from '../application/FarmPicking';
import type { FarmToolSurface } from '../application/FarmPicking';
export interface PlacementPreview {
  kind: 'farm' | 'warehouse' | 'cooler' | 'shop' | 'orderBoard' | 'dock';
  x: number;
  z: number;
  valid: boolean;
}
export class TownView {
  private readonly factory = new ModelFactory();
  private island!: IslandView;
  private readonly root: Node;
  private readonly resources: GroundObjects;
  private readonly buildings = new Map<
    string,
    {
      signature: string;
      node: Node;
      kind: Building['kind'];
      surface: ModelPicking;
      crops: RenderedCropPicking;
    }
  >();
  private readonly feedback: TownFeedback;
  private previous: GameState | null = null;
  private marker: Node | null = null;
  private markerKey = '';
  private lifted: string | null = null;
  private picking: TownObjectPicking | null = null;
  private visibleHit(ray: geometry.Ray, exclude?: string) {
    this.picking ??= new TownObjectPicking(
      () => this.resources,
      (sample, excluded) => this.buildingHit(sample, excluded),
      () =>
        [...this.buildings]
          .filter(([id]) => id !== this.lifted)
          .map(([id, entry]) => ({ id, surface: entry.surface })),
    );
    return this.picking.hit(ray, exclude);
  }
  constructor(parent: Node) {
    this.root = new Node('TownWorld');
    parent.addChild(this.root);
    this.feedback = this.root.addComponent(TownFeedback);
    this.feedback.configure(this.factory);
    this.island = new IslandView(this.root, 40);
    this.resources = new GroundObjects(this.root, (x, z) => this.island.isGroundReady(x, z));
  }
  sync(
    state: GameState,
    selection: string | null,
    preview: PlacementPreview | null,
    now = Date.now(),
  ): void {
    this.picking?.clear();
    const previous = this.previous;
    this.previous = state;
    this.island.sync(state);
    const effectiveNow = Math.max(now, state.lastSeenAt);
    this.resources.sync(state, this.island.naturalSurface, effectiveNow, this.island.dropSupport);
    townChanges(previous, state, this.feedback, (id) => this.resources.dropOrigin(id));
    const live = new Set(state.buildings.map((b) => b.id));
    for (const [id, entry] of this.buildings)
      if (!live.has(id)) {
        entry.node.destroy();
        this.buildings.delete(id);
      }
    for (const b of state.buildings) {
      const signature = [
        state.mapSeed,
        state.terrainVersion,
        JSON.stringify(state.landExtensions),
        b.kind,
        b.x,
        b.z,
        b.rotation,
        b.farmSize,
        b.irrigated,
        b.dockStyle,
        b.boatAttached,
        b.bridge?.length,
        JSON.stringify(b.collectionBox),
        b.compost ? compostStage(b.compost, effectiveNow) : '',
        b.kind === 'nursery' ? nurseryStage(b, effectiveNow) : processingStage(b, effectiveNow),
        JSON.stringify(state.fusion.attachments[b.id] ?? {}),
        b.kind === 'farm' ? farmVisuals(b.cropJobs, effectiveNow).join(',') : Boolean(b.job),
      ].join(':');
      const old = this.buildings.get(b.id);
      if (old?.signature === signature) continue;
      old?.node.destroy();
      const node = this.factory.building(
        b,
        effectiveNow,
        state.mapSeed,
        state.terrainVersion,
        state.landExtensions,
      );
      this.root.addChild(node);
      const stock = state.fusion.attachments[b.id];
      if (stock) {
        const materials = attachmentModel(this.factory, stock, b.kind, b.farmSize);
        materials.setRotationFromEuler(0, b.rotation * 90, 0);
        node.addChild(materials);
      }
      const before = previous?.buildings.find((entry) => entry.id === b.id);
      if (
        previous &&
        previous.mapSeed === state.mapSeed &&
        (!before ||
          before.kind !== b.kind ||
          before.farmSize !== b.farmSize ||
          before.irrigated !== b.irrigated ||
          JSON.stringify(previous.fusion.attachments[b.id]) !==
            JSON.stringify(state.fusion.attachments[b.id]))
      )
        this.feedback.construct(node, b);
      node.active = b.id !== this.lifted;
      this.buildings.set(b.id, {
        signature,
        node,
        kind: b.kind,
        surface: new ModelPicking(node),
        crops: new RenderedCropPicking(node),
      });
    }
    const selected = state.buildings.find((b) => b.id === selection);
    const key = preview
      ? JSON.stringify(preview)
      : selected
        ? `${selected.id}:${selected.kind}:${selected.x}:${selected.z}:${selected.rotation}:${selected.farmSize}:${Boolean(selected.collectionBox)}`
        : '';
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.marker?.destroy();
    this.marker = null;
    if (preview) this.outline(preview, preview.valid ? '#EFD377' : '#D87163');
    else if (selected) this.outline(selected, '#F3D37C');
  }
  get loading(): boolean {
    return this.island.isLoading() || this.resources.loading;
  }
  frame(bounds: WorldViewBounds, treeBounds = bounds): void {
    if (this.previous?.terrainVersion !== 5) return;
    const changed = this.island.frame(bounds);
    if (changed)
      this.resources.sync(
        this.previous,
        this.island.naturalSurface,
        Math.max(Date.now(), this.previous.lastSeenAt),
        this.island.dropSupport,
      );
    if (this.resources.frame(treeBounds) || changed) this.picking?.clear();
  }
  objectBounds(target: ObjectTarget) {
    if (target.kind !== 'building') return this.resources.objectBounds(target);
    const node = this.buildings.get(target.id)?.node;
    return node ? modelBounds(node) : null;
  }
  setLifted(id: string | null): void {
    this.picking?.clear();
    this.lifted = id;
    for (const [key, entry] of this.buildings) entry.node.active = key !== id;
  }
  pickBuilding(ray: geometry.Ray, excludeId?: string): string | null {
    const hit = this.visibleHit(ray, excludeId);
    return hit?.kind === 'building' ? hit.id : null;
  }
  private buildingHit(ray: geometry.Ray, excludeId?: string, farms = true) {
    let nearest: { id: string; distance: number } | null = null;
    for (const [id, entry] of this.buildings) {
      if (id === excludeId || id === this.lifted || (!farms && entry.kind === 'farm')) continue;
      const distance = entry.surface.distance(ray, nearest?.distance);
      if (
        distance !== null &&
        (!nearest ||
          distance < nearest.distance ||
          (distance === nearest.distance && id < nearest.id))
      )
        nearest = { id, distance };
    }
    return nearest;
  }
  private farmToolSurface(ray: geometry.Ray) {
    let nearest: FarmToolSurface | null = null;
    for (const [id, entry] of this.buildings) {
      if (id === this.lifted) continue;
      const crop = entry.kind === 'farm' ? entry.crops : null;
      const hit = entry.surface.hit(ray, nearest?.distance, (node) => crop?.cellAt(node) != null);
      if (!hit) continue;
      const cell = crop?.cellAt(hit.node) ?? null;
      if (
        !nearest ||
        hit.distance < nearest.distance ||
        (hit.distance === nearest.distance && cell !== null && nearest.cell === null)
      )
        nearest = {
          buildingId: id,
          cell,
          soil: crop?.isSoil(hit.node) ?? false,
          distance: hit.distance,
        };
    }
    const tree = this.resources.pickTree(ray),
      pile = this.resources.pickStack(ray);
    const natural = this.resources.pickNatural(ray);
    for (const blocker of [tree, pile, natural, this.resources.pickDrop?.(ray)])
      if (blocker && blocker.distance < (nearest?.distance ?? Infinity))
        nearest = { buildingId: null, cell: null, soil: false, distance: blocker.distance };
    return nearest;
  }
  pickPlant(ray: geometry.Ray) {
    const hit = this.farmToolSurface(ray);
    return hit?.buildingId
      ? { buildingId: hit.buildingId, cell: hit.cell, distance: hit.distance }
      : null;
  }
  pickCrop(ray: geometry.Ray, state = this.previous, purpose: 'plant' | 'harvest' = 'harvest') {
    if (!state) return null;
    if (purpose === 'plant') {
      const hit = this.pickPlant(ray);
      return hit && hit.cell !== null ? { ...hit, cell: hit.cell } : null;
    }
    return resolveHarvestHit(
      state.buildings,
      ray,
      this.farmToolSurface(ray),
      Math.max(Date.now(), state.lastSeenAt),
    );
  }
  private outline(
    b: Pick<Building, 'kind' | 'x' | 'z' | 'farmSize' | 'collectionBox'> & {
      rotation?: Building['rotation'];
    },
    shade: string,
  ): void {
    this.marker = buildingOutline(this.root, this.factory, b, shade, 'PlacementOutline');
  }
  setLiftedStack(id: string | null): void {
    this.picking?.clear();
    this.resources.setLifted(id);
  }
  pickStack(ray: geometry.Ray, exclude?: string) {
    const hit = this.visibleHit(ray, exclude);
    return hit?.kind === 'pile' ? { id: hit.id, x: hit.x, z: hit.z, distance: hit.distance } : null;
  }
  pickTree(ray: geometry.Ray): string | null {
    const hit = this.visibleHit(ray);
    return hit?.kind === 'tree' ? hit.id : null;
  }
  setLiftedDrop(id: string | null): void {
    this.picking?.clear();
    this.resources.setLiftedDrop(id);
  }
  pickDrop(ray: geometry.Ray): string | null {
    const hit = this.visibleHit(ray);
    return hit?.kind === 'drop' ? hit.id : null;
  }
  dropOrigin(id: string) {
    return this.resources.dropOrigin(id);
  }
  naturalOrigin(id: string) {
    return this.resources.naturalOrigin(id);
  }
  pickNatural(ray: geometry.Ray): string | null {
    return this.pickNaturalHit(ray)?.id ?? null;
  }
  pickNaturalHit(ray: geometry.Ray) {
    const hit = this.visibleHit(ray);
    return hit?.kind === 'natural'
      ? { id: hit.id, distance: hit.distance, point: hit.point }
      : null;
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
