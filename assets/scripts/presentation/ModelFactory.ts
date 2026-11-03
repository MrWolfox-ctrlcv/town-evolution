import { Node, Mesh, MeshRenderer, Material, primitives, utils } from 'cc';
import { isDockShore } from '../domain/island';
import { CONFIG } from '../domain/game';
import type { Building } from '../domain/game';
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
      material = new Material();
      material.initialize({ effectName: 'builtin-unlit' });
      material.setProperty('mainColor', color(hex));
      this.materials.set(hex, material);
    }
    renderer.mesh = mesh;
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
  building(b: Building, now: number, mapSeed = 1): Node {
    const cfg = CONFIG.buildings[b.kind];
    const w = b.rotation % 2 ? cfg.depth : cfg.width,
      d = b.rotation % 2 ? cfg.width : cfg.depth;
    const root = new Node(b.id);
    root.setPosition(b.x + w / 2, 0, b.z + d / 2);
    if (b.kind === 'farm') {
      const grid = new Node('FarmGrid');
      grid.setRotationFromEuler(0, b.rotation * 90, 0);
      root.addChild(grid);
      grid.addChild(this.assets.create('farm-cell-bed', 'Soil'));
      const moving: MovingCrop[] = [];
      farmVisuals(b.cropJobs, now).forEach((stage, cell) => {
        const node = new Node(`Cell${cell}`);
        node.setPosition(
          (((cell % 3) + 0.5) * 2) / 3 - 1,
          0,
          ((Math.floor(cell / 3) + 0.5) * 2) / 3 - 1,
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
      if (moving.length) grid.addComponent(CropMotion).configure(moving, now);
      return root;
    }
    const assetIds: Record<Exclude<Building['kind'], 'farm'>, string> = {
      warehouse: 'warehouse-base',
      expandedWarehouse: 'warehouse-expanded',
      coldWarehouse: 'warehouse-cold',
      cooler: 'cooler',
      shop: 'shop',
      orderBoard: 'order-board',
      dock: 'dock',
    };
    const id = assetIds[b.kind];
    const visual = this.assets.create(id, 'BuildingMesh');
    visual.setRotationFromEuler(0, b.rotation * 90, 0);
    if (b.kind === 'dock' && isDockShore(b, mapSeed)) {
      const pier = new Node('RotatedPier');
      root.addChild(pier);
      pier.setRotationFromEuler(0, b.rotation * 90, 0);
      this.pier(pier, cfg.depth);
    }
    root.addChild(visual);
    return root;
  }
}
