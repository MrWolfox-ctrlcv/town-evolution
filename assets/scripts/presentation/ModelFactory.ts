import { Node, Mesh, MeshRenderer, Material, primitives, utils } from 'cc';
import { CONFIG } from '../domain/game';
import type { Building } from '../domain/game';
import { color } from './Palette';
import { AssetRenderer } from './AssetRenderer';
import { cropStage } from '../art/AssetCatalog';
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
        type === 'sphere' ? primitives.sphere(0.5, { segments: 6 }) : primitives.box(),
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
  building(b: Building, now: number): Node {
    const cfg = CONFIG.buildings[b.kind];
    const w = b.rotation ? cfg.depth : cfg.width,
      d = b.rotation ? cfg.width : cfg.depth;
    const root = new Node(b.id);
    root.setPosition(b.x + w / 2, 0, b.z + d / 2);
    const id =
      b.kind === 'farm'
        ? `farm-${cropStage(b.job, now)}`
        : b.kind === 'cooler'
          ? 'cooler'
          : b.kind === 'expandedWarehouse'
            ? 'warehouse-expanded'
            : b.kind === 'coldWarehouse'
              ? 'warehouse-cold'
              : 'warehouse-base';
    const visual = this.assets.create(id, b.kind === 'farm' ? 'Soil' : 'BuildingMesh');
    visual.setRotationFromEuler(0, b.rotation ? 90 : 0, 0);
    root.addChild(visual);
    return root;
  }
}
