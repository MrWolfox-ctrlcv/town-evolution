import type { V6SurfaceMesh } from './V6SurfaceContracts';
/** Published cells reference contiguous ranges in their one canonical chunk. */
export interface V6CellSpan {
  mesh: V6SurfaceMesh;
  vertexStart: number;
  vertexEnd: number;
  triangleStart: number;
  triangleEnd: number;
  min: readonly number[];
  max: readonly number[];
}
export type V6CellPatch = V6SurfaceMesh | V6CellSpan;
export function appendV6Cell(target: V6SurfaceMesh, patch: V6CellPatch): V6CellSpan {
  const span = 'mesh' in patch ? patch : null;
  const mesh = span?.mesh ?? (patch as V6SurfaceMesh);
  const start = span?.vertexStart ?? 0,
    end = span?.vertexEnd ?? mesh.positions.length / 3;
  const first = span?.triangleStart ?? 0,
    last = span?.triangleEnd ?? mesh.triangles.length;
  const vertexStart = target.positions.length / 3,
    triangleStart = target.triangles.length;
  for (let i = start * 3; i < end * 3; i++) target.positions.push(mesh.positions[i]!);
  for (let i = start * 3; i < end * 3; i++) target.normals.push(mesh.normals[i]!);
  for (let i = start * 4; i < end * 4; i++) target.colors.push(mesh.colors[i]!);
  for (let i = first * 3; i < last * 3; i++)
    target.indices.push(mesh.indices[i]! - start + vertexStart);
  for (let i = first; i < last; i++) target.triangles.push(mesh.triangles[i]!);
  if (last > first)
    for (let a = 0; a < 3; a++) {
      target.min[a] = Math.min(target.min[a]!, patch.min[a]!);
      target.max[a] = Math.max(target.max[a]!, patch.max[a]!);
    }
  return {
    mesh: target,
    vertexStart,
    vertexEnd: target.positions.length / 3,
    triangleStart,
    triangleEnd: target.triangles.length,
    min: patch.min,
    max: patch.max,
  };
}
