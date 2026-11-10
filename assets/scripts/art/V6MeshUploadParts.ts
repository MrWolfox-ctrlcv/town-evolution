import type { MeshData } from './AssetTypes';
import { emptyNaturalMesh } from './NaturalMesh';
export interface V6TriangleRange {
  readonly start: number;
  readonly end: number;
}
export const V6_UPLOAD_PART_BYTES = 65536;
// Cocos 3.8.8 createMesh: RGB32F position/normal, RGBA32F color, RG32F UV0 and R16UI indices.
const VERTEX_BYTES = 48;
const INDEX_BYTES = 2;
function vertices(mesh: MeshData): number {
  const count = mesh.positions.length / 3;
  if (
    !Number.isInteger(count) ||
    mesh.normals.length !== count * 3 ||
    mesh.colors.length !== count * 4 ||
    (mesh.uvs && mesh.uvs.length !== count * 2) ||
    mesh.indices.length % 3 !== 0
  )
    throw Error('Invalid v6 upload attributes');
  return count;
}
/** Includes UV0 even when WorldMesh creates its zero-filled default; not a JS heap estimate. */
export function v6MeshBytes(mesh: MeshData): number {
  return vertices(mesh) * VERTEX_BYTES + mesh.indices.length * INDEX_BYTES;
}
/** Lazy triangle-preserving parts. Every emitted mesh fits both 64KiB and the 16-bit index range. */
export function* iterateV6UploadParts(
  source: MeshData,
  limit = V6_UPLOAD_PART_BYTES,
  ranges: readonly V6TriangleRange[] = [{ start: 0, end: source.indices.length / 3 }],
): Generator<MeshData> {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 3 * VERTEX_BYTES + 3 * INDEX_BYTES ||
    limit > V6_UPLOAD_PART_BYTES
  )
    throw Error('Invalid v6 upload part budget');
  const count = vertices(source);
  if (!source.indices.length) return;
  let mesh = emptyNaturalMesh(),
    map = new Map<number, number>(),
    bytes = 0;
  if (source.uvs) mesh.uvs = [];
  for (const range of ranges) {
    if (
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < 0 ||
      range.end < range.start ||
      range.end * 3 > source.indices.length
    )
      throw Error('Invalid v6 upload range');
  }
  for (const range of ranges)
    for (let i = range.start * 3; i < range.end * 3; i += 3) {
      const tri = [source.indices[i]!, source.indices[i + 1]!, source.indices[i + 2]!];
      for (const id of tri)
        if (!Number.isSafeInteger(id) || id < 0 || id >= count)
          throw Error('Invalid v6 upload index');
      const fresh = new Set(tri.filter((id) => !map.has(id))).size;
      if (bytes + fresh * VERTEX_BYTES + 3 * INDEX_BYTES > limit) {
        yield mesh;
        mesh = emptyNaturalMesh();
        if (source.uvs) mesh.uvs = [];
        map = new Map();
        bytes = 0;
      }
      for (const id of tri) {
        let local = map.get(id);
        if (local === undefined) {
          local = map.size;
          map.set(id, local);
          for (let axis = 0; axis < 3; axis++) {
            const position = source.positions[id * 3 + axis]!,
              normal = source.normals[id * 3 + axis]!;
            if (!Number.isFinite(position) || !Number.isFinite(normal))
              throw Error('Invalid v6 upload vertex');
            mesh.positions.push(position);
            mesh.normals.push(normal);
            mesh.min[axis] = Math.min(mesh.min[axis]!, position);
            mesh.max[axis] = Math.max(mesh.max[axis]!, position);
          }
          for (let axis = 0; axis < 4; axis++) {
            const color = source.colors[id * 4 + axis]!;
            if (!Number.isFinite(color)) throw Error('Invalid v6 upload color');
            mesh.colors.push(color);
          }
          if (source.uvs)
            for (let axis = 0; axis < 2; axis++) {
              const uv = source.uvs[id * 2 + axis]!;
              if (!Number.isFinite(uv)) throw Error('Invalid v6 upload UV');
              mesh.uvs!.push(uv);
            }
          bytes += VERTEX_BYTES;
        }
        mesh.indices.push(local);
        bytes += INDEX_BYTES;
      }
    }
  if (mesh.indices.length) yield mesh;
}
export function v6UploadParts(source: MeshData, limit = V6_UPLOAD_PART_BYTES): MeshData[] {
  return [...iterateV6UploadParts(source, limit)];
}
