import type { MeshData } from './AssetTypes';
import { emptyNaturalMesh } from './NaturalMesh';
import { ContinuousResources } from './ContinuousResources';
import type { ReferenceCell } from './ContinuousField';
import type { NaturalSurfaceData } from './NaturalSurfaceData';
import { buildContinuousCoast } from './ContinuousCoast';
import type { CoastProtection } from './ContinuousCoast';
export type IslandSurface = ReferenceCell;
export interface IslandResource {
  id?: string;
  x: number;
  z: number;
  kind: 'stone' | 'soil';
  amount: number;
}
export interface IslandTerrainOptions {
  /** Immutable seed/version terrain provider. It must not read remaining stock. */
  surface?: (x: number, z: number) => IslandSurface | null;
  resources?: readonly IslandResource[];
  protectedRects?: readonly CoastProtection[];
}
export interface IslandTerrainMesh extends MeshData {
  naturalSurface: NaturalSurfaceData;
  triangleOwners: (string | null)[];
  coastFallback: boolean;
}
/** Canonical offline/export helper. In-game IslandView caches coast/water and live fields separately. */
export function islandTerrain(
  size: number,
  seed = 73129,
  isLand: (x: number, z: number) => boolean = () => true,
  options: IslandTerrainOptions = {},
): IslandTerrainMesh {
  const land = (x: number, z: number) => x >= 0 && z >= 0 && x < size && z < size && isLand(x, z);
  if (options.resources?.length && !options.surface)
    throw new Error('Continuous terrain requires an immutable seed reference provider');
  const coast = buildContinuousCoast(size, seed, land, options.protectedRects);
  const resources = new ContinuousResources(size, seed, (x, z) =>
    land(x, z) ? (options.surface?.(x, z) ?? null) : null,
  ).sync(
    (options.resources ?? [])
      .filter((r) => land(r.x, r.z))
      .map((r) => ({ ...r, id: r.id ?? `n${r.x}_${r.z}` })),
  );
  const mesh = emptyNaturalMesh();
  for (const part of [coast.mesh, resources.mesh]) {
    const offset = mesh.positions.length / 3;
    // Avoid spreading large scene arrays into the JavaScript argument stack.
    for (const v of part.positions) mesh.positions.push(v);
    for (const v of part.normals) mesh.normals.push(v);
    for (const v of part.colors) mesh.colors.push(v);
    for (const i of part.indices) mesh.indices.push(i + offset);
    if (part.indices.length)
      for (let a = 0; a < 3; a++) {
        mesh.min[a] = Math.min(mesh.min[a]!, part.min[a]!);
        mesh.max[a] = Math.max(mesh.max[a]!, part.max[a]!);
      }
  }
  if (!mesh.indices.length) {
    mesh.min = [0, 0.015, 0];
    mesh.max = [0, 0.015, 0];
  }
  const offset = coast.mesh.positions.length / 3;
  return {
    ...mesh,
    naturalSurface: {
      positions: mesh.positions,
      resources: resources.naturalSurface.resources.map((r) => ({
        ...r,
        indices: r.indices.map((i) => i + offset),
      })),
    },
    triangleOwners: [
      ...Array(coast.mesh.indices.length / 3).fill(null),
      ...resources.triangleOwners,
    ],
    coastFallback: coast.coastFallback,
  };
}
