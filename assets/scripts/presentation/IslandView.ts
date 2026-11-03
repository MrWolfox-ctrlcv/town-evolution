import { Node, Mesh, MeshRenderer, Material, Color, utils } from 'cc';
import { islandTerrain } from '../art/IslandTerrain';
import { isLandCell } from '../domain/island';
import { footprint } from '../domain/geometry';
import type { GameState } from '../domain/types';
import { sceneGroundArt, appendGroundMesh } from '../art/SceneGroundArt';
/** One terrain mesh/material; the saved seed changes scenery only, never legal land. */
export class IslandView {
  private mesh: Mesh | null = null;
  private readonly material: Material;
  private readonly renderer: MeshRenderer;
  private signature = '';
  constructor(
    parent: Node,
    private readonly size: number,
  ) {
    this.material = new Material();
    this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
    this.material.setProperty('mainColor', new Color(255, 255, 255, 255));
    const node = new Node('SeededIslandTerrain');
    parent.addChild(node);
    this.renderer = node.addComponent(MeshRenderer);
    this.renderer.setMaterial(this.material, 0);
  }
  sync(state: GameState): void {
    const seed = state.mapSeed;
    const signature = JSON.stringify([
      seed,
      state.groundStacks.map((p) => [p.x, p.z]),
      state.buildings.map((b) => [b.kind, b.x, b.z, b.rotation]),
      state.trees.map((t) => [t.x, t.z]),
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    const data = islandTerrain(this.size, seed, (x, z) => isLandCell(x, z, seed));
    const actors = [
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
    ];
    appendGroundMesh(
      data,
      sceneGroundArt(this.size, seed, actors, (x, z) => isLandCell(x, z, seed)),
    );
    const old = this.mesh;
    this.mesh = utils.createMesh({
      positions: data.positions,
      normals: data.normals,
      colors: data.colors,
      indices: data.indices,
    });
    this.renderer.mesh = this.mesh;
    old?.destroy();
  }
  dispose(): void {
    this.mesh?.destroy();
    this.material.destroy();
  }
}
