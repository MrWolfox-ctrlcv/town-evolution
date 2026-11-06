import { V5IslandView } from './V5IslandView';
import { Node, Mesh, MeshRenderer, Material, Color } from 'cc';
import { worldMaterial, worldShadows } from './WorldMaterial';
import { worldMesh } from './WorldMesh';
import { splitMesh16 } from '../art/MeshChunks';
import { ContinuousResources } from '../art/ContinuousResources';
import { buildContinuousCoast, coastProtectionSignature } from '../art/ContinuousCoast';
import type { CoastProtectionSnapshot } from '../art/ContinuousCoast';
import { buildCoastalWater } from '../art/CoastalWater';
import { CoastalWaterMotion } from './CoastalWaterMotion';
import type { NaturalSurfaceData } from '../art/NaturalSurfaceData';
import { terrainAt } from '../domain/terrain';
import { worldSize } from '../domain/world';
import type { TerrainCell } from '../domain/terrain';
import { footprint } from '../domain/geometry';
import type { GameState } from '../domain/types';
import type { MeshData } from '../art/AssetTypes';
import { sceneGroundArt } from '../art/SceneGroundArt';
import { dropRect } from '../application/DropGeometry';
import { farmBoxCell } from '../domain/game';
import { DropSupport } from './DropSupport';
/** Coast/water only rebuild when topology or actual shoreline protection changes. */
export class IslandView {
  readonly dropSupport = new DropSupport();
  private v5: V5IslandView | null = null;
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
    this.material = worldMaterial();
    this.waterMaterial = new Material();
    this.waterMaterial.initialize({
      effectName: 'builtin-unlit',
      defines: { USE_VERTEX_COLOR: true },
    });
    this.waterMaterial.setProperty('mainColor', new Color(255, 255, 255, 255));
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
    if (renderer === this.terrainRenderer) this.dropSupport.set('natural', data);
    if (renderer === this.coastRenderer) this.dropSupport.set('coast', data);
    if (renderer === this.detailRenderer) this.dropSupport.set('roads', data);
    renderer.mesh = null;
    for (const node of this.extraChunks.get(renderer) ?? []) {
      node.removeFromParent();
      node.destroy();
    }
    this.extraChunks.delete(renderer);
    old.forEach((mesh) => mesh.destroy());
    const nodes: Node[] = [];
    const meshes = splitMesh16(data).map((chunk, index) => {
      const mesh = worldMesh(chunk);
      let target = renderer;
      if (index) {
        const node = new Node(`TerrainChunk-${index}`);
        node.layer = renderer.node.layer;
        renderer.node.addChild(node);
        nodes.push(node);
        target = node.addComponent(MeshRenderer);
        target.setMaterial(this.material, 0);
        target.shadowCastingMode = renderer.shadowCastingMode;
        target.receiveShadow = renderer.receiveShadow;
      }
      target.mesh = mesh;
      return mesh;
    });
    this.extraChunks.set(renderer, nodes);
    return meshes;
  }
  sync(state: GameState): void {
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
    const buildings = state.buildings.map((b) => [
      b.kind,
      b.x,
      b.z,
      b.rotation,
      b.farmSize,
      footprint(b),
    ]);
    const boxRects = state.buildings.flatMap((b) => {
      const p = farmBoxCell(b);
      return p ? [{ ...p, width: 1, depth: 1 }] : [];
    });
    const dropRects = (state.looseDrops ?? []).map(dropRect);
    const protectedRects = [
      ...state.buildings.map((b) => ({ x: b.x, z: b.z, ...footprint(b) })),
      ...boxRects,
      ...dropRects,
    ];
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
    const actors = [
      ...boxRects.map((p) => ({ ...p, tree: false, resource: true, rotation: 0 })),
      ...dropRects.map((p) => ({ ...p, tree: false, prop: true, rotation: 0 })),
      ...state.groundStacks.map((p) => ({
        x: p.x,
        z: p.z,
        width: 1,
        depth: 1,
        tree: false,
        prop: true,
        rotation: 0,
      })),
      ...state.buildings.map((b) => ({
        x: b.x,
        z: b.z,
        ...footprint(b),
        rotation: b.rotation,
        tree: false,
      })),
      ...state.trees.map((t) => ({ x: t.x, z: t.z, width: 1, depth: 1, rotation: 0, tree: true })),
      ...state.naturalResources.map((r) => ({
        x: r.x,
        z: r.z,
        width: 1,
        depth: 1,
        rotation: 0,
        tree: false,
        resource: true,
      })),
    ];
    this.detailMesh = this.replace(
      this.detailRenderer,
      this.detailMesh,
      sceneGroundArt(this.size, seed, actors, land, surface),
    );
  }
  frame(
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    budget: { maxPatchBuilds?: number; maxMilliseconds?: number; maxUploadBytes?: number } = {},
  ): boolean {
    const changed = this.v5?.frame(bounds, budget) ?? false;
    if (changed) this.naturalSurface = this.v5!.naturalSurface;
    return changed;
  }
  isGroundReady(x: number, z: number): boolean {
    return this.v5?.isGroundReady(x, z) ?? true;
  }
  isLoading(): boolean {
    return this.v5?.isLoading() ?? false;
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
    this.material.destroy();
    this.waterMaterial.destroy();
  }
}
