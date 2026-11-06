import { Node, Mesh, MeshRenderer, Material } from 'cc';
import { worldMaterial, worldShadows } from './WorldMaterial';
import { worldMesh } from './WorldMesh';
import { acquireBuildingTexture } from './BuildingTexture';
import type { BuildingTexture } from './BuildingTexture';
import type { ResourceLease } from '../application/SharedResource';
import { ASSETS } from '../art/AssetCatalog';
import { compileAsset } from '../art/MeshCompiler';
import type { AssetRecipe } from '../art/AssetTypes';
/** One palette batch, plus one shared generated-wood batch for textured components. */
export class AssetRenderer {
  private readonly meshes = new Map<string, Mesh>();
  private readonly material: Material;
  private wood: ResourceLease<BuildingTexture> | null = null;
  private disposed = false;
  constructor() {
    this.material = worldMaterial();
  }
  create(id: string, name = id): Node {
    const recipe = ASSETS[id];
    if (!recipe) throw new Error(`Unknown art asset ${id}`);
    return this.createRecipe(recipe, name);
  }
  createRecipe(recipe: AssetRecipe, name = recipe.id): Node {
    if (this.disposed) throw new Error('Cannot create an asset after renderer disposal');
    const id = recipe.id;
    const node = new Node(name);
    const hasWood = recipe.parts.some((p) => p.texture === 'warm-wood');
    for (const textured of hasWood ? [false, true] : [false]) {
      const key = `${id}/${textured ? 'wood' : 'palette'}`;
      let mesh = this.meshes.get(key);
      if (!mesh) {
        const data = compileAsset(
          hasWood
            ? { ...recipe, parts: recipe.parts.filter((p) => Boolean(p.texture) === textured) }
            : recipe,
        );
        if (!data.indices.length) continue;
        mesh = worldMesh(data);
        this.meshes.set(key, mesh);
      }
      const target = textured ? new Node('GeneratedWoodMaterial') : node;
      if (textured) node.addChild(target);
      const renderer = target.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      worldShadows(renderer);
      // Pure palette assets never request or upload the wood image.
      const material = textured
        ? (this.wood ??= acquireBuildingTexture()).value.material
        : this.material;
      renderer.setMaterial(material, 0);
    }
    return node;
  }
  whenReady(): Promise<void> {
    return this.wood?.value.ready ?? Promise.resolve();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.material.destroy();
    this.wood?.release();
    this.wood = null;
    for (const mesh of this.meshes.values()) mesh.destroy();
    this.meshes.clear();
  }
}
