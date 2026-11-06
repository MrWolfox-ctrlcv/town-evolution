import type { MeshData } from './AssetTypes';
import { emptyNaturalMesh } from './NaturalMesh';

/** Cocos 3.8.8 createMesh uses uint16 indices, even for larger source arrays.
 * Keep each triangle and its attributes intact, without changing the picking snapshot. */
export function splitMesh16(data: MeshData): MeshData[] {
  const limit = 65535;
  if (!data.indices.length) return [];
  if (data.positions.length / 3 <= limit) return [data];
  const chunks: MeshData[] = [];
  let mesh = emptyNaturalMesh();
  let vertices = new Map<number, number>();
  if (data.uvs) mesh.uvs = [];
  const flush = () => {
    if (mesh.indices.length) chunks.push(mesh);
    mesh = emptyNaturalMesh();
    if (data.uvs) mesh.uvs = [];
    vertices = new Map();
  };
  for (let i = 0; i < data.indices.length; i += 3) {
    const triangle = data.indices.slice(i, i + 3);
    const needed = new Set(triangle.filter((index) => !vertices.has(index))).size;
    if (vertices.size + needed > limit) flush();
    for (const source of triangle) {
      let target = vertices.get(source);
      if (target === undefined) {
        target = vertices.size;
        vertices.set(source, target);
        for (let axis = 0; axis < 3; axis++) {
          const value = data.positions[source * 3 + axis]!;
          mesh.positions.push(value);
          mesh.normals.push(data.normals[source * 3 + axis]!);
          mesh.min[axis] = Math.min(mesh.min[axis]!, value);
          mesh.max[axis] = Math.max(mesh.max[axis]!, value);
        }
        mesh.colors.push(...data.colors.slice(source * 4, source * 4 + 4));
        if (data.uvs) mesh.uvs!.push(...data.uvs.slice(source * 2, source * 2 + 2));
      }
      mesh.indices.push(target);
    }
  }
  flush();
  return chunks;
}
