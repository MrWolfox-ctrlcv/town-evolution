import type { MeshData } from './AssetTypes';
import { emptyNaturalMesh } from './NaturalMesh';
/** Lazy bounded submission parts. Each yield finishes at most one source-buffer
 * batch; the caller controls scheduling and retains the canonical picker mesh. */
export function* iterateV5UploadParts(source: MeshData, limit = 65536): Generator<MeshData> {
  if (!source.indices.length) return;
  let mesh = emptyNaturalMesh(),
    map = new Map<number, number>(),
    bytes = 0;
  for (let i = 0; i < source.indices.length; i += 3) {
    const tri = source.indices.slice(i, i + 3),
      fresh = [...new Set(tri.filter((n) => !map.has(n)))],
      cost = fresh.length * 40 + 12;
    if (bytes + cost > limit) {
      yield mesh;
      mesh = emptyNaturalMesh();
      map = new Map();
      bytes = 0;
    }
    for (const id of tri) {
      let local = map.get(id);
      if (local === undefined) {
        local = map.size;
        map.set(id, local);
        for (let a = 0; a < 3; a++) {
          const p = source.positions[id * 3 + a]!;
          mesh.positions.push(p);
          mesh.normals.push(source.normals[id * 3 + a]!);
          mesh.min[a] = Math.min(mesh.min[a]!, p);
          mesh.max[a] = Math.max(mesh.max[a]!, p);
        }
        mesh.colors.push(...source.colors.slice(id * 4, id * 4 + 4));
        bytes += 40;
      }
      mesh.indices.push(local);
    }
    bytes += 12;
  }
  if (mesh.indices.length) yield mesh;
}
export function v5UploadParts(source: MeshData, limit = 65536): MeshData[] {
  return [...iterateV5UploadParts(source, limit)];
}
export function v5MeshBytes(mesh: MeshData): number {
  return (
    4 * (mesh.positions.length + mesh.normals.length + mesh.colors.length + mesh.indices.length)
  );
}
