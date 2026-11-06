import type { MeshData } from './AssetTypes';
/** Shared vertex writer; coast geometry and water keep real normals and unlit albedo. */
export function coastVertex(
  mesh: MeshData,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  color: readonly number[],
): number {
  const index = mesh.positions.length / 3;
  mesh.positions.push(x, y, z);
  mesh.normals.push(nx, ny, nz);
  mesh.colors.push(color[0]!, color[1]!, color[2]!, 1);
  [x, y, z].forEach((v, i) => {
    mesh.min[i] = Math.min(mesh.min[i]!, v);
    mesh.max[i] = Math.max(mesh.max[i]!, v);
  });
  return index;
}
