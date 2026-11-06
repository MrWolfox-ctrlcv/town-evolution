import { Node, Mesh, MeshRenderer, Material } from 'cc';
import { splitMesh16 } from '../art/MeshChunks';
import { worldMesh } from './WorldMesh';
import type { MeshData } from '../art/AssetTypes';
import type { DropSupport } from './DropSupport';
export function replaceIslandMesh(
  renderer: MeshRenderer,
  old: Mesh[],
  data: MeshData,
  terrainRenderer: MeshRenderer,
  coastRenderer: MeshRenderer,
  detailRenderer: MeshRenderer,
  dropSupport: DropSupport,
  extraChunks: Map<MeshRenderer, Node[]>,
  material: Material,
): Mesh[] {
  if (renderer === terrainRenderer) dropSupport.set('natural', data);
  if (renderer === coastRenderer) dropSupport.set('coast', data);
  if (renderer === detailRenderer) dropSupport.set('roads', data);
  renderer.mesh = null;
  for (const node of extraChunks.get(renderer) ?? []) {
    node.removeFromParent();
    node.destroy();
  }
  extraChunks.delete(renderer);
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
      target.setMaterial(material, 0);
      target.shadowCastingMode = renderer.shadowCastingMode;
      target.receiveShadow = renderer.receiveShadow;
    }
    target.mesh = mesh;
    return mesh;
  });
  extraChunks.set(renderer, nodes);
  return meshes;
}
