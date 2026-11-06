import type { MeshData } from './AssetTypes';
import type { V6SurfaceMesh, V6SurfaceChunk, V6SurfaceTriangle } from './V6SurfaceContracts';
import type { NaturalResourceSurface } from './NaturalSurfaceData';
export function emptyV6SurfaceMesh(): V6SurfaceMesh {
  return {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    triangles: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}
export function appendV6Mesh(target: V6SurfaceMesh, source: MeshData): void {
  const offset = target.positions.length / 3;
  for (const v of source.positions) target.positions.push(Math.fround(v));
  for (const v of source.normals) target.normals.push(v);
  for (const v of source.colors) target.colors.push(v);
  for (const v of source.indices) target.indices.push(v + offset);
  if ('triangles' in source) {
    for (const triangle of (source as V6SurfaceMesh).triangles) target.triangles.push(triangle);
  } else {
    const metadata = new Map<string, V6SurfaceTriangle>();
    for (let i = 0; i < source.indices.length; i += 3) {
      const at = source.indices[i]! * 3;
      const x = Math.floor(source.positions[at]!),
        z = Math.floor(source.positions[at + 2]!);
      const key = `${x},${z}`;
      let meta = metadata.get(key);
      if (!meta) {
        meta = Object.freeze({ x, z, surface: 'coast', resourceId: null, material: 'grass' });
        metadata.set(key, meta);
      }
      target.triangles.push(meta);
    }
  }
  if (source.indices.length)
    for (let axis = 0; axis < 3; axis++) {
      target.min[axis] = Math.min(target.min[axis]!, source.min[axis]!);
      target.max[axis] = Math.max(target.max[axis]!, source.max[axis]!);
    }
}
/** Single quantized buffer for renderer, resource picker, cell picker and drop support. */
export function* finishV6ChunkSteps(
  key: string,
  mesh: V6SurfaceMesh,
  batch = 128,
): Generator<void, V6SurfaceChunk> {
  let remaining = Math.max(1, Math.floor(batch));
  const resources = new Map<string, NaturalResourceSurface>();
  for (let t = 0; t < mesh.triangles.length; t++) {
    if (--remaining === 0) {
      remaining = Math.max(1, Math.floor(batch));
      yield;
    }
    const meta = mesh.triangles[t]!;
    if (!meta.resourceId) continue;
    let resource = resources.get(meta.resourceId);
    if (!resource) {
      resource = {
        id: meta.resourceId,
        indices: [],
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
        center: [meta.x + 0.5, 0, meta.z + 0.5],
      };
      resources.set(meta.resourceId, resource);
    }
    const lo = resource.min as [number, number, number],
      hi = resource.max as [number, number, number];
    for (let j = 0; j < 3; j++) {
      const index = mesh.indices[t * 3 + j]!;
      resource.indices.push(index);
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a]!, mesh.positions[index * 3 + a]!);
        hi[a] = Math.max(hi[a]!, mesh.positions[index * 3 + a]!);
      }
    }
    (resource.center as [number, number, number])[1] = hi[1];
  }
  if (!mesh.indices.length) mesh.min = mesh.max = [0, 0, 0];
  return { key, mesh, surface: { positions: mesh.positions, resources: [...resources.values()] } };
}

/** Offline callers can consume the same cooperative builder synchronously. */
export function finishV6Chunk(key: string, mesh: V6SurfaceMesh): V6SurfaceChunk {
  const work = finishV6ChunkSteps(key, mesh);
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}
