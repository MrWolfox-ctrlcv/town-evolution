import type { WorldBoxTest } from '../application/WorldVisibility';
import { islandGroundActors, islandGroundLayout } from './IslandGroundActors';
import { V5IslandView } from './V5IslandView';
import { V6IslandView } from './V6IslandView';
import type { SurfaceRay } from '../application/NaturalPicking';
import { emptyNaturalMesh } from '../art/NaturalMesh';
import { Node, Mesh, MeshRenderer, Material } from 'cc';
import { worldShadows } from './WorldMaterial';
import { TerrainMaterial } from './TerrainMaterial';
import { createWaterMaterial } from './WaterMaterial';
import { replaceIslandMesh } from './IslandMeshUpload';
import { ContinuousResources } from '../art/ContinuousResources';
import { buildContinuousCoast, coastProtectionSignature } from '../art/ContinuousCoast';
import type { CoastProtectionSnapshot } from '../art/ContinuousCoast';
import { buildCoastalWater } from '../art/CoastalWater';
import { CoastalWaterMotion } from './CoastalWaterMotion';
import type { NaturalSurfaceData } from '../art/NaturalSurfaceData';
import { terrainAt } from '../domain/terrain';
import { worldSize } from '../domain/world';
import type { TerrainCell } from '../domain/terrain';
import type { GameState } from '../domain/types';
import type { MeshData } from '../art/AssetTypes';
import { sceneGroundArt } from '../art/SceneGroundArt';
import { DropSupport } from './DropSupport';
/** Coast/water only rebuild when topology or actual shoreline protection changes. */
export class IslandView {
  readonly dropSupport = new DropSupport();
  private v5: V5IslandView | null = null;
  private v6: V6IslandView | null = null;
  private terrainMesh: Mesh[] = [];
  private coastMesh: Mesh[] = [];
  private readonly waterMotion: CoastalWaterMotion;
  private resourceField: ContinuousResources | null = null;
  naturalSurface: NaturalSurfaceData = { positions: [], resources: [] };
  private coastSignature = '';
  private coastInputSignature = '';
  private coastProtection: CoastProtectionSnapshot | null = null;
  private readonly coastRenderer: MeshRenderer;
  private readonly waterRenderer: MeshRenderer;
  private detailMesh: Mesh[] = [];
  private readonly extraChunks = new Map<MeshRenderer, Node[]>();
  private readonly terrainMaterial = new TerrainMaterial();
  private readonly material: Material;
  private readonly waterMaterial: Material;
  private readonly terrainRenderer: MeshRenderer;
  private readonly detailRenderer: MeshRenderer;
  private terrainSignature = '';
  private detailSignature = '';
  private topologySignature = '';
  private readonly surfaceCells = new Map<string, TerrainCell>();
  constructor(
    parent: Node,
    private size: number,
  ) {
    this.material = this.terrainMaterial.material;
    this.waterMaterial = createWaterMaterial();
    const layer = (name: string): MeshRenderer => {
      const node = new Node(name);
      parent.addChild(node);
      const renderer = node.addComponent(MeshRenderer);
      const water = name === 'CoastalWater';
      renderer.setMaterial(water ? this.waterMaterial : this.material, 0);
      if (!water) worldShadows(renderer, name !== 'IslandGroundDetails');
      return renderer;
    };
    this.waterRenderer = layer('CoastalWater');
    this.waterMotion = this.waterRenderer.node.addComponent(CoastalWaterMotion);
    this.coastRenderer = layer('ContinuousIslandCoast');
    this.terrainRenderer = layer('SeededIslandTerrain');
    this.detailRenderer = layer('IslandGroundDetails');
  }
  private replace(renderer: MeshRenderer, old: Mesh[], data: MeshData): Mesh[] {
    return replaceIslandMesh(
      renderer,
      old,
      data,
      this.terrainRenderer,
      this.coastRenderer,
      this.detailRenderer,
      this.dropSupport,
      this.extraChunks,
      this.material,
    );
  }
  sync(state: GameState): void {
    if (state.terrainVersion === 6 || state.terrainVersion === 7) {
      if (!this.v6) {
        this.v5?.dispose();
        this.v5 = null;
        this.clearLegacy();
        this.dropSupport.set('roads', emptyNaturalMesh());
        this.v6 = new V6IslandView(
          this.terrainRenderer,
          this.waterRenderer,
          this.material,
          this.waterMotion,
          this.dropSupport,
        );
      }
      this.v6.sync(state);
      this.naturalSurface = this.v6.naturalSurface;
      return;
    }
    if (this.v6) {
      this.v6.dispose();
      this.v6 = null;
    }

    if (state.terrainVersion === 5) {
      if (!this.v5) {
        this.clearLegacy();
        this.v5 = new V5IslandView(
          this.terrainRenderer,
          this.coastRenderer,
          this.waterRenderer,
          this.material,
          this.waterMotion,
          this.dropSupport,
        );
      }
      this.v5.sync(state);
      this.naturalSurface = this.v5.naturalSurface;
      return;
    }
    if (this.v5) {
      this.v5.dispose();
      this.v5 = null;
    }
    this.dropSupport.setFarms(state.buildings);
    this.size = worldSize(state.terrainVersion);
    const seed = state.mapSeed;
    const topologySignature = JSON.stringify([seed, state.terrainVersion, state.landExtensions]);
    if (topologySignature !== this.topologySignature) {
      this.topologySignature = topologySignature;
      this.coastProtection = null;
      this.surfaceCells.clear();
      for (let z = 0; z < this.size; z++)
        for (let x = 0; x < this.size; x++) {
          const cell = terrainAt(x, z, seed, state.terrainVersion, state.landExtensions);
          if (cell) this.surfaceCells.set(`${x},${z}`, cell);
        }
      this.resourceField = new ContinuousResources(
        this.size,
        seed,
        (x, z) => this.surfaceCells.get(`${x},${z}`) ?? null,
      );
    }
    const land = (x: number, z: number) => this.surfaceCells.has(`${x},${z}`);
    const surface = (x: number, z: number) => this.surfaceCells.get(`${x},${z}`) ?? null;
    const { buildings, boxRects, dropRects, protectedRects } = islandGroundLayout(state);
    const coastInputSignature = JSON.stringify(protectedRects);
    if (!this.coastProtection || coastInputSignature !== this.coastInputSignature) {
      this.coastInputSignature = coastInputSignature;
      if (
        !this.coastProtection ||
        coastProtectionSignature(this.coastProtection, protectedRects) !== this.coastSignature
      ) {
        const coast = buildContinuousCoast(this.size, seed, land, protectedRects);
        this.coastProtection = {
          boundary: coast.boundary,
          outlines: coast.outlines,
          coastFallback: coast.coastFallback,
        };
        this.coastSignature = coastProtectionSignature(this.coastProtection, protectedRects);
        this.coastMesh = this.replace(this.coastRenderer, this.coastMesh, coast.mesh);
        this.waterMotion.configure(
          this.waterRenderer,
          buildCoastalWater(this.size, seed, coast.waterlines),
          seed,
        );
      }
    }
    const terrainSignature = JSON.stringify([
      seed,
      state.terrainVersion,
      state.naturalResources,
      state.landExtensions,
    ]);
    if (terrainSignature !== this.terrainSignature) {
      this.terrainSignature = terrainSignature;
      const result = this.resourceField!.sync(state.naturalResources.filter((r) => land(r.x, r.z)));
      if (this.naturalSurface.positions !== result.naturalSurface.positions) {
        this.naturalSurface = result.naturalSurface;
        this.terrainMesh = this.replace(this.terrainRenderer, this.terrainMesh, result.mesh);
      }
    }
    const detailSignature = JSON.stringify([
      terrainSignature,
      state.groundStacks.map((p) => [p.x, p.z]),
      buildings,
      boxRects,
      dropRects,
      state.trees.map((t) => [t.x, t.z]),
    ]);
    if (detailSignature === this.detailSignature) return;
    this.detailSignature = detailSignature;
    const actors = islandGroundActors(state, boxRects, dropRects);
    this.detailMesh = this.replace(
      this.detailRenderer,
      this.detailMesh,
      sceneGroundArt(this.size, seed, actors, land, surface),
    );
  }
  frame(
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    budget: { maxPatchBuilds?: number; maxMilliseconds?: number; maxUploadBytes?: number } = {},
    visible?: WorldBoxTest,
    lodSpan?: number,
    maxError?: number,
    overviewError?: number,
    priority?: { x: number; z: number },
  ): boolean {
    if (this.v6) {
      const changed = this.v6.frame(
        bounds,
        budget,
        visible,
        lodSpan,
        maxError,
        overviewError,
        priority,
      );
      if (changed) this.naturalSurface = this.v6.naturalSurface;
      return changed;
    }
    const changed = this.v5?.frame(bounds, budget) ?? false;
    if (changed) this.naturalSurface = this.v5!.naturalSurface;
    return changed;
  }
  pickTerrain(ray: SurfaceRay) {
    return this.v6?.pickTerrain(ray) ?? null;
  }
  terrainDistance(ray: SurfaceRay): number | null {
    return this.v6?.terrainDistance(ray) ?? null;
  }
  isGroundReady(x: number, z: number): boolean {
    return this.v6?.isGroundReady(x, z) ?? this.v5?.isGroundReady(x, z) ?? true;
  }
  surfaceStatus() {
    return this.v6?.surfaceStatus() ?? null;
  }
  isGroundVisible(x: number, z: number): boolean {
    return this.v6?.isGroundVisible(x, z) ?? this.isGroundReady(x, z);
  }
  surfaceProblem(): string | null {
    return this.v6?.surfaceProblem() ?? null;
  }
  isLoading(): boolean {
    return this.v6?.isLoading() ?? this.v5?.isLoading() ?? false;
  }
  private clearLegacy(): void {
    this.topologySignature = '';
    this.terrainSignature = '';
    this.detailSignature = '';
    this.coastSignature = '';
    this.coastInputSignature = '';
    this.resourceField = null;
    for (const renderer of [this.terrainRenderer, this.coastRenderer, this.detailRenderer]) {
      renderer.mesh = null;
      for (const node of this.extraChunks.get(renderer) ?? []) {
        node.removeFromParent();
        node.destroy();
      }
      this.extraChunks.delete(renderer);
    }
    for (const mesh of [...this.terrainMesh, ...this.coastMesh, ...this.detailMesh]) mesh.destroy();
    this.terrainMesh = [];
    this.coastMesh = [];
    this.detailMesh = [];
  }
  dispose(): void {
    this.v6?.dispose();
    this.v6 = null;
    this.v5?.dispose();
    this.v5 = null;
    this.surfaceCells.clear();
    this.coastProtection = null;
    this.terrainMesh.forEach((mesh) => mesh.destroy());
    this.coastMesh.forEach((mesh) => mesh.destroy());
    this.waterMotion.onDestroy();
    this.resourceField = null;
    this.naturalSurface = { positions: [], resources: [] };
    this.detailMesh.forEach((mesh) => mesh.destroy());
    for (const nodes of this.extraChunks.values())
      for (const node of nodes) {
        node.removeFromParent();
        node.destroy();
      }
    this.extraChunks.clear();
    this.terrainMaterial.dispose();
    this.waterMaterial.destroy();
  }
}
