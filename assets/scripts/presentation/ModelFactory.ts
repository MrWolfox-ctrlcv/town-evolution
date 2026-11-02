import { Node, Mesh, MeshRenderer, Material, primitives, utils } from 'cc';
import { CONFIG } from '../domain/game';
import type { Building } from '../domain/game';
import { color } from './Palette';
/** Reusable geometry and materials; each building is a modular node hierarchy. */
export class ModelFactory {
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
    for (const m of this.materials.values()) m.destroy();
    for (const m of this.meshes.values()) m.destroy();
  }
  building(b: Building): Node {
    const cfg = CONFIG.buildings[b.kind];
    const w = b.rotation ? cfg.depth : cfg.width;
    const d = b.rotation ? cfg.width : cfg.depth;
    const root = new Node(b.id);
    root.setPosition(b.x + w / 2, 0, b.z + d / 2);
    if (b.kind === 'farm') {
      this.shape(root, 'Soil', 0, 0.12, 0, w - 0.14, 0.16, d - 0.14, '#936F4C');
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          this.shape(
            root,
            'Crop',
            (i - 1) * 0.48,
            0.32,
            (j - 1) * 0.48,
            0.34,
            b.job ? 0.35 : 0.16,
            0.34,
            b.job ? '#D5C65C' : '#5D924D',
            'sphere',
          );
        }
    } else if (b.kind === 'cooler') {
      this.shape(root, 'Unit', 0, 0.48, 0, w * 0.75, 0.9, d * 0.75, '#BCD3D3');
      this.shape(root, 'Fan', 0, 0.55, d * 0.39, 0.5, 0.5, 0.06, '#467C80', 'sphere');
    } else {
      const cold = b.kind === 'coldWarehouse';
      const expanded = b.kind === 'expandedWarehouse';
      this.shape(root, 'Walls', 0, 0.67, 0, w - 0.2, 1.2, d - 0.2, '#F1DEC1');
      this.shape(root, 'Roof', 0, 1.36, 0, w + 0.02, 0.24, d + 0.02, cold ? '#679EAD' : '#BC7356');
      const leftRoof = this.shape(
        root,
        'RoofSlopeL',
        -w * 0.24,
        1.63,
        0,
        w * 0.57,
        0.12,
        d + 0.08,
        cold ? '#81B0BB' : '#D78A64',
      );
      leftRoof.setRotationFromEuler(0, 0, 24);
      const rightRoof = this.shape(
        root,
        'RoofSlopeR',
        w * 0.24,
        1.63,
        0,
        w * 0.57,
        0.12,
        d + 0.08,
        cold ? '#679EAD' : '#BC7356',
      );
      rightRoof.setRotationFromEuler(0, 0, -24);
      this.shape(
        root,
        'Door',
        0,
        0.48,
        d / 2 - 0.07,
        0.65,
        0.8,
        0.06,
        cold ? '#B7DAE2' : '#8D6549',
      );
      this.shape(root, 'Window', w * 0.28, 0.87, d / 2 - 0.065, 0.35, 0.35, 0.07, '#79AFB5');
      if (cold)
        this.shape(
          root,
          'RefrigerationAttachment',
          -w * 0.34,
          0.47,
          d * 0.33,
          0.5,
          0.7,
          0.5,
          '#6C929C',
        );
      if (expanded) {
        this.shape(root, 'UpperStore', 0, 1.85, 0, w * 0.6, 0.55, d * 0.6, '#E5CB9E');
        this.shape(root, 'UpperRoof', 0, 2.16, 0, w * 0.7, 0.13, d * 0.7, '#BC7356');
      }
      this.shape(root, 'Crate', -w * 0.3, 0.24, d * 0.36, 0.4, 0.4, 0.4, '#BA935D');
    }
    return root;
  }
}
