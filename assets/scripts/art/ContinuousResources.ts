import type { MeshData, V3 } from './AssetTypes';
import type { NaturalSurfaceData, NaturalResourceSurface } from './NaturalSurfaceData';
import { ContinuousField } from './ContinuousField';
import type { CurvedResource, ReferenceCell } from './ContinuousField';
import { resourcePatch } from './ResourcePatch';
import { emptyNaturalMesh } from './NaturalMesh';
export interface ResourceTerrainResult {
  mesh: MeshData;
  naturalSurface: NaturalSurfaceData;
  triangleOwners: string[];
  rebuiltCells: number;
}
interface Patch {
  mesh: MeshData;
  center: V3;
  id: string;
  x: number;
  z: number;
}
/** Immutable natural surfaces and per-column cuts rebuild only changed cells and shared walls.
 * The merged upload shares the exact vertex snapshot used by triangle picking. */
export class ContinuousResources {
  readonly field: ContinuousField;
  private readonly patches = new Map<string, Patch>();
  private result: ResourceTerrainResult | null = null;
  constructor(
    size: number,
    seed: number,
    reference: (x: number, z: number) => ReferenceCell | null,
  ) {
    this.field = new ContinuousField(size, seed, reference);
  }
  sync(resources: readonly CurvedResource[]): ResourceTerrainResult {
    const changed = this.field.sync(resources);
    if (!changed.length && this.result) return { ...this.result, rebuiltCells: 0 };
    const live = new Set(resources.filter((r) => r.amount > 0).map((r) => r.id));
    for (const id of this.patches.keys()) if (!live.has(id)) this.patches.delete(id);
    let rebuiltCells = 0;
    for (const resource of this.field.resources.values()) {
      // Only the modified column and its four neighbors can gain or lose cut faces.
      if (
        this.patches.has(resource.id) &&
        !changed.some((r) => Math.abs(resource.x - r.x) + Math.abs(resource.z - r.z) <= 1)
      )
        continue;
      this.patches.set(resource.id, this.buildPatch(resource));
      rebuiltCells++;
    }
    const mesh = emptyNaturalMesh(),
      surfaces: NaturalResourceSurface[] = [],
      triangleOwners: string[] = [];
    for (const patch of [...this.patches.values()].sort((a, b) => a.x - b.x || a.z - b.z)) {
      const offset = mesh.positions.length / 3,
        indices = patch.mesh.indices.map((i) => i + offset);
      mesh.positions.push(...patch.mesh.positions);
      mesh.normals.push(...patch.mesh.normals);
      mesh.colors.push(...patch.mesh.colors);
      mesh.indices.push(...indices);
      for (let axis = 0; axis < 3; axis++) {
        mesh.min[axis] = Math.min(mesh.min[axis]!, patch.mesh.min[axis]!);
        mesh.max[axis] = Math.max(mesh.max[axis]!, patch.mesh.max[axis]!);
      }
      surfaces.push({
        id: patch.id,
        indices,
        min: patch.mesh.min as unknown as V3,
        max: patch.mesh.max as unknown as V3,
        center: patch.center,
      });
      for (let i = 0; i < indices.length; i += 3) triangleOwners.push(patch.id);
    }
    if (!mesh.indices.length) {
      mesh.min = [0, 0.015, 0];
      mesh.max = [0, 0.015, 0];
    }
    this.result = {
      mesh,
      naturalSurface: { positions: mesh.positions, resources: surfaces },
      triangleOwners,
      rebuiltCells,
    };
    return this.result;
  }
  private buildPatch(resource: CurvedResource): Patch {
    const mesh = resourcePatch(this.field, resource),
      { x, z } = resource;
    return {
      mesh,
      id: resource.id,
      x,
      z,
      center: [x + 0.5, this.field.height(x + 0.5, z + 0.5), z + 0.5],
    };
  }
}
