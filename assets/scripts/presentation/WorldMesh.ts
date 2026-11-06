import { Mesh, utils } from 'cc';
import type { MeshData } from '../art/AssetTypes';

/** Cocos does not calculate static mesh bounds by default. Shadow culling requires them. */
export function worldMesh(data: MeshData): Mesh {
  if (
    data.min.length !== 3 ||
    data.max.length !== 3 ||
    ![...data.min, ...data.max].every(Number.isFinite) ||
    data.min.some((value, axis) => value > data.max[axis]!)
  )
    throw new Error('World mesh requires finite local bounds');
  return utils.createMesh({
    positions: data.positions,
    normals: data.normals,
    colors: data.colors,
    indices: data.indices,
    // Use this material batch/chunk's bounds, never the unsplit source's full extent.
    minPos: { x: data.min[0]!, y: data.min[1]!, z: data.min[2]! },
    maxPos: { x: data.max[0]!, y: data.max[1]!, z: data.max[2]! },
    // Standard's vertex input declares UV0 even for plain albedo variants.
    uvs: data.uvs ?? new Array((data.positions.length / 3) * 2).fill(0),
  });
}
