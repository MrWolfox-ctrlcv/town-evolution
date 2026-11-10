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
  /** Instance meshes are released with the model, not retained by the shared asset cache. */
  createTransient(data: import('../art/AssetTypes').MeshData, name: string): Node {
    if (this.disposed) throw new Error('Cannot create an asset after renderer disposal');
    const node = new Node(name),
      textured = new Set(data.texturedIndices ?? []);
    const palette = data.indices.filter(
      (_index, offset) => !textured.has(data.indices[offset - (offset % 3)]!),
    );
    for (const [wood, indices] of [
      [false, palette],
      [true, data.texturedIndices ?? []],
    ] as const) {
      if (!indices.length) continue;
      const mesh = worldMesh({ ...data, indices: [...indices] });
      const target = wood ? new Node('GeneratedWoodMaterial') : node;
      if (wood) node.addChild(target);
      const renderer = target.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(
        wood ? (this.wood ??= acquireBuildingTexture()).value.material : this.material,
        0,
      );
      worldShadows(renderer);
      node.on(Node.EventType.NODE_DESTROYED, () => mesh.destroy());
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
