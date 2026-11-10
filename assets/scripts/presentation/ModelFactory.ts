import { bridgeFootings } from '../art/BridgeFootings';
import { v6BridgeMesh } from '../art/V6BridgeKit';
import { v6BridgeProfile } from '../domain/v6-bridge-profile';
import { v6BridgeFootings, v6RiverPierFootings } from '../art/V6BridgeFootings';
import { BRIDGE_ROOT_HEIGHT } from '../art/WoodenBridgeKit';
import { V5_PIER_FOOT_UNIT, v5PierFootings } from '../art/V5PierFootings';
import { v6PierFootings } from '../art/V6PierFootings';
import { farmCollectionBoxAssetId, farmBoxLocalCenter } from '../art/FarmBoxKit';
import { buildingAssetId } from '../art/BuildingAssets';
import type { TerrainVersion } from '../domain/world';
import { Node, Mesh, MeshRenderer, Material, primitives, utils } from 'cc';
import { worldMaterial, worldShadows } from './WorldMaterial';
import { isDockShore } from '../domain/island';
import { CONFIG, footprint, farmGridSize, hasDockExit } from '../domain/game';
import type { Building, LandCell } from '../domain/game';
import { color } from './Palette';
import { AssetRenderer } from './AssetRenderer';
import { CropMotion } from './CropMotion';
import type { MovingCrop } from './CropMotion';
import { cropPhase } from '../art/CropAnimation';
import { farmVisuals } from '../art/FarmCellKit';
/** Reusable geometry and materials; buildings use merged meshes from modular recipes. */
export class ModelFactory {
  private readonly assets = new AssetRenderer();
  private readonly materials = new Map<string, Material>();
  private readonly meshes = new Map<string, Mesh>();
  shape(
    parent: Node,
    name: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    hex: string,
    type = 'box',
  ): Node {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, z);
    node.setScale(sx, sy, sz);
    const renderer = node.addComponent(MeshRenderer);
    let mesh = this.meshes.get(type);
    if (!mesh) {
      mesh = utils.createMesh(
        type === 'sphere'
          ? primitives.sphere(0.5, { segments: 6 })
          : type === 'cylinder'
            ? primitives.cylinder(0.5, 0.5, 1, { radialSegments: 8 })
            : primitives.box(),
      );
      this.meshes.set(type, mesh);
    }
    let material = this.materials.get(hex);
    if (!material) {
      material = worldMaterial(false);
      material.setProperty('mainColor', color(hex));
      this.materials.set(hex, material);
    }
    renderer.mesh = mesh;
    worldShadows(renderer);
    renderer.setMaterial(material, 0);
    return node;
  }
  dispose(): void {
    this.assets.dispose();
    for (const m of this.materials.values()) m.destroy();
    for (const m of this.meshes.values()) m.destroy();
  }
  asset(id: string, name = id): Node {
    return this.assets.create(id, name);
  }
  /** Extension is scenery over water; cargo staging remains inside the logical footprint. */
  private pier(root: Node, depth: number): void {
    for (let i = 0; i < 9; i++) {
      const z = depth / 2 - 0.1 + i * 0.25;
      this.shape(root, 'PierPlank', 0, 0.23, z, 1.1, 0.12, 0.24, i % 2 ? '#B77E43' : '#D49A53');
    }
    for (const x of [-0.48, 0.48])
      for (const z of [depth / 2 + 0.4, depth / 2 + 1.8]) {
        this.shape(root, 'PierPile', x, 0.03, z, 0.13, 0.9, 0.13, '#765039');
        this.shape(root, 'MooringRope', x, 0.43, z, 0.17, 0.065, 0.17, '#F5E2BE');
      }
  }
  building(
    b: Building,
    now: number,
    mapSeed = 1,
    terrainVersion: TerrainVersion = 3,
    landExtensions: readonly LandCell[] = [],
    baseElevation = 0,
  ): Node {
    const cfg = CONFIG.buildings[b.kind];
    const { width: w, depth: d } = footprint(b);
    const root = new Node(b.id);
    root.setPosition(
      b.x + w / 2,
      b.kind === 'woodenBridge'
        ? (terrainVersion === 6 || terrainVersion === 7) && b.bridge
          ? v6BridgeProfile(mapSeed, { ...b, length: b.bridge.length }, terrainVersion).root
          : BRIDGE_ROOT_HEIGHT
        : baseElevation,
      b.z + d / 2,
    );
    if (b.kind === 'farm') {
      const grid = new Node('FarmGrid');
      grid.setRotationFromEuler(0, b.rotation * 90, 0);
      root.addChild(grid);
      const size = farmGridSize(b);
      const span = (size * 2) / 3;
      const bed = b.farmSize === 6 ? 'farm-large-bed' : 'farm-cell-bed';
      grid.addChild(this.assets.create(`${bed}${b.irrigated ? '-water' : ''}`, 'Soil'));
      const moving: MovingCrop[] = [];
      farmVisuals(b.cropJobs, now).forEach((stage, cell) => {
        const node = new Node(`Cell${cell}`);
        node.setPosition(
          (((cell % size) + 0.5) * 2) / 3 - span / 2,
          0,
          ((Math.floor(cell / size) + 0.5) * 2) / 3 - span / 2,
        );
        const job = b.cropJobs?.[cell];
        if (stage !== 'empty' && job) {
          const pivot = new Node('CropSoilPivot');
          pivot.setPosition(0, 0.17, 0);
          const mesh = this.assets.create(`crop-cell-${stage}`, `Crop-${stage}`);
          mesh.setPosition(0, -0.17, 0);
          pivot.addChild(mesh);
          node.addChild(pivot);
          moving.push({
            node: pivot,
            job: { ...job },
            phase: cropPhase(b.x, b.z, cell),
            ready: stage.endsWith('ready'),
          });
        }
        grid.addChild(node);
      });
      if (b.collectionBox) {
        const box = this.assets.create(
          farmCollectionBoxAssetId(b.collectionBox.stock),
          'FarmCollectionBox',
        );
        box.setPosition(...farmBoxLocalCenter(b.farmSize === 6 ? 6 : 3));
        grid.addChild(box);
      }
      if (moving.length) grid.addComponent(CropMotion).configure(moving, now);
      return root;
    }
    const id = buildingAssetId(b, now);
    const visual =
      b.kind === 'woodenBridge' && (terrainVersion === 6 || terrainVersion === 7)
        ? this.assets.createTransient(v6BridgeMesh(b, mapSeed, terrainVersion), 'BuildingMesh')
        : this.assets.create(id, 'BuildingMesh');
    visual.setRotationFromEuler(0, b.rotation * 90, 0);
    if (
      b.kind === 'woodenBridge' &&
      (terrainVersion === 5 || terrainVersion === 6 || terrainVersion === 7)
    ) {
      const supports = new Node('BridgeSupports');
      supports.setRotationFromEuler(0, b.rotation * 90, 0);
      root.addChild(supports);
      for (const [index, foot] of (terrainVersion === 6 || terrainVersion === 7
        ? v6BridgeFootings(b, mapSeed, terrainVersion)
        : bridgeFootings(b, mapSeed)
      ).entries()) {
        const node = this.assets.createRecipe(V5_PIER_FOOT_UNIT, `BridgeFooting${index}`);
        node.setPosition(foot.x, foot.y, foot.z);
        node.setScale(foot.width, foot.height, foot.width);
        supports.addChild(node);
      }
    }
    if (b.kind === 'woodenPier' && (terrainVersion === 6 || terrainVersion === 7)) {
      for (const [index, foot] of v6RiverPierFootings(
        b,
        mapSeed,
        baseElevation,
        terrainVersion,
      ).entries()) {
        const node = this.assets.createRecipe(V5_PIER_FOOT_UNIT, `RiverPierFooting${index}`);
        node.setPosition(foot.x, foot.y, foot.z);
        node.setScale(foot.width, foot.height, foot.width);
        visual.addChild(node);
      }
    }
    if (
      b.kind === 'dock' &&
      (b.dockStyle === 'simple'
        ? hasDockExit({ mapSeed, terrainVersion, landExtensions: [...landExtensions] }, b)
        : isDockShore(b, mapSeed, terrainVersion, landExtensions))
    ) {
      const pier = new Node('RotatedPier');
      root.addChild(pier);
      pier.setRotationFromEuler(0, b.rotation * 90, 0);
      if (b.dockStyle === 'simple')
        pier.addChild(this.assets.create('dock-pier-extension', 'PierExtension'));
      else this.pier(pier, cfg.depth);
      if (terrainVersion === 5 || terrainVersion === 6 || terrainVersion === 7)
        for (const [index, foot] of (terrainVersion === 6 || terrainVersion === 7
          ? v6PierFootings(b.dockStyle === 'simple', cfg.depth, baseElevation)
          : v5PierFootings(b.dockStyle === 'simple', cfg.depth)
        ).entries()) {
          const name = `V5PierFooting${index}`;
          if (b.dockStyle === 'simple') {
            const node = this.assets.createRecipe(V5_PIER_FOOT_UNIT, name);
            node.setPosition(foot.x, foot.y, foot.z);
            node.setScale(foot.width, foot.height, foot.width);
            pier.addChild(node);
          } else
            this.shape(
              pier,
              name,
              foot.x,
              foot.y,
              foot.z,
              foot.width,
              foot.height,
              foot.width,
              '#765039',
            );
        }
    }
    root.addChild(visual);
    return root;
  }
}
