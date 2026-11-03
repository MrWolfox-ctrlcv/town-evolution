import { Node, Mesh, MeshRenderer, Material, utils, Color } from 'cc';
import { ASSETS } from '../art/AssetCatalog';
import { compileAsset } from '../art/MeshCompiler';
/** One merged vertex-colored mesh per model; recipes remain the editable modular source. */
export class AssetRenderer {
  private readonly meshes = new Map<string, Mesh>();
  private readonly material: Material;
  constructor() {
    this.material = new Material();
    this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
    this.material.setProperty('mainColor', new Color(255, 255, 255, 255));
  }
  create(id: string, name = id): Node {
    const recipe = ASSETS[id];
    if (!recipe) throw new Error(`Unknown art asset ${id}`);
    let mesh = this.meshes.get(id);
    if (!mesh) {
      const data = compileAsset(recipe);
      mesh = utils.createMesh({
        positions: data.positions,
        normals: data.normals,
        colors: data.colors,
        indices: data.indices,
      });
      this.meshes.set(id, mesh);
    }
    const node = new Node(name);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(this.material, 0);
    return node;
  }
  dispose(): void {
    this.material.destroy();
    for (const mesh of this.meshes.values()) mesh.destroy();
    this.meshes.clear();
  }
}
