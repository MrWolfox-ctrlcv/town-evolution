import type { PlacementPreview, BuildingVisualEntry } from './TownViewContracts';
export type { PlacementPreview } from './TownViewContracts';
import type { WorldBoxTest } from '../application/WorldVisibility';
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
import { buildingVisualSignature } from './BuildingVisualSignature';
import type { Building, GameState } from '../domain/game';
import { GroundObjects } from './GroundObjects';
import { ModelFactory } from './ModelFactory';
import { ModelPicking } from './ModelPicking';
import { RenderedCropPicking } from './RenderedCropPicking';
import { resolveHarvestHit } from '../application/FarmPicking';
import { townFarmToolSurface } from './TownFarmPicking';
import { buildingGroundReady } from '../application/BuildingGroundReady';
export class TownView {
  private readonly factory = new ModelFactory();
  private island!: IslandView;
  private readonly root: Node;
  private readonly resources: GroundObjects;
  private readonly buildings = new Map<string, BuildingVisualEntry>();
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
      (sample) =>
        this.previous?.terrainVersion === 6 || this.previous?.terrainVersion === 7
          ? this.island.terrainDistance(sample)
          : null,
      (hit) =>
        (this.previous?.terrainVersion !== 6 && this.previous?.terrainVersion !== 7) ||
        (hit.kind === 'building' ? this.buildingReady(hit.id) : this.resources.isUsable(hit)),
    );
    return this.picking.hit(ray, exclude);
  }
  constructor(parent: Node) {
    this.root = new Node('TownWorld');
    parent.addChild(this.root);
    this.feedback = this.root.addComponent(TownFeedback);
    this.feedback.configure(this.factory);
    this.island = new IslandView(this.root, 40);
    this.resources = new GroundObjects(
      this.root,
      (x, z) => this.island.isGroundReady(x, z),
      (x, z) => this.island.isGroundVisible(x, z),
    );
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
    townChanges(previous, state, this.feedback, this.resources);
    const live = new Set(state.buildings.map((b) => b.id));
    for (const [id, entry] of this.buildings)
      if (!live.has(id)) {
        entry.node.destroy();
        this.buildings.delete(id);
      }
    for (const b of state.buildings) {
      const signature = buildingVisualSignature(state, b, effectiveNow);
      const old = this.buildings.get(b.id);
      if (old?.signature === signature) continue;
      old?.node.destroy();
      const node = this.factory.building(
        b,
        effectiveNow,
        state.mapSeed,
        state.terrainVersion,
        state.landExtensions,
        b.baseElevation ?? 0,
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
        ? `${selected.id}:${selected.kind}:${selected.x}:${selected.z}:${selected.rotation}:${selected.farmSize}:${selected.baseElevation}:${Boolean(selected.collectionBox)}`
        : '';
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.marker?.destroy();
    this.marker = null;
    if (preview) this.outline(preview, preview.valid ? '#EFD377' : '#D87163');
    else if (selected) this.outline(selected, '#F3D37C');
  }
  get surfaceStatus() {
    return this.island.surfaceStatus();
  }
  get surfaceProblem(): string | null {
    return this.island.surfaceProblem();
  }
  get loading(): boolean {
    return this.island.isLoading() || this.resources.loading;
  }
  frame(
    bounds: WorldViewBounds,
    treeBounds = bounds,
    treeLodSpan?: number,
    visible?: WorldBoxTest,
    maxError?: number,
    overviewError?: number,
  ): void {
    if (!this.previous || this.previous.terrainVersion < 5) return;
    const changed = this.island.frame(bounds, {}, visible, treeLodSpan, maxError, overviewError);
    if (changed)
      this.resources.sync(
        this.previous,
        this.island.naturalSurface,
        Math.max(Date.now(), this.previous.lastSeenAt),
        this.island.dropSupport,
      );
    if (this.resources.frame(treeBounds, treeLodSpan) || changed) this.picking?.clear();
  }
  isGroundReady(x: number, z: number): boolean {
    return this.island.isGroundReady(x, z);
  }
  pickTerrain(ray: geometry.Ray) {
    return this.island.pickTerrain(ray);
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
  private buildingReady(id: string): boolean {
    if (this.previous?.terrainVersion !== 6 && this.previous?.terrainVersion !== 7) return true;
    const b = this.previous.buildings.find((entry) => entry.id === id);
    return !!b && buildingGroundReady(b, (x, z) => this.island.isGroundReady(x, z));
  }
  private farmToolSurface(ray: geometry.Ray) {
    return townFarmToolSurface(
      ray,
      this.buildings,
      this.lifted,
      this.resources,
      this.previous?.terrainVersion === 6 || this.previous?.terrainVersion === 7
        ? (sample) => this.island.terrainDistance(sample)
        : null,
      (id) => this.buildingReady(id),
    );
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
    b: Pick<Building, 'kind' | 'x' | 'z' | 'farmSize' | 'collectionBox' | 'baseElevation'> & {
      rotation?: Building['rotation'];
    },
    shade: string,
  ): void {
    this.marker = buildingOutline(
      this.root,
      this.factory,
      b,
      shade,
      'PlacementOutline',
      (b.baseElevation ?? 0) + 0.09,
    );
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
  stackOrigin(x: number, z: number) {
    return this.resources.stackOrigin(x, z);
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
