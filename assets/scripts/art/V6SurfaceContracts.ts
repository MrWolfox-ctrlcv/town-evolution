import type { MeshData, V3 } from './AssetTypes';
import type { V6Hydrology } from '../domain/v6-hydrology';
import type { NaturalSurfaceData } from './NaturalSurfaceData';
import type { V6SurfaceSupport } from '../application/V6SurfaceSupport';
export type V6SurfaceMaterial = 'soil' | 'stone';
export interface V6SurfacePoint {
  x: number;
  z: number;
  h: number;
  g: number;
}
export interface V6SurfaceResource {
  id: string;
  x: number;
  z: number;
  kind: 'soil' | 'stone';
  amount: number;
}
export interface V6SurfaceWorld {
  readonly seed: number;
  readonly size: number;
  readonly hydrology: V6Hydrology;
  at(x: number, z: number): { reserved: boolean } | null;
  cellUpperBound?(x: number, z: number): number;
  groundHeight(x: number, z: number): number;
  naturalHeight(x: number, z: number): number;
  normal(x: number, z: number, ground: boolean): V3;
  resourceAt(x: number, z: number): V6SurfaceResource | null;
}
/** Immutable read capability. Edits and inventory remain owned by the domain. */
export interface V6SurfaceSource {
  readonly world: V6SurfaceWorld;
  readonly revision: string;
  editAt(
    x: number,
    z: number,
  ): {
    cut: number;
    level: number;
    fills: readonly { level: number; material: V6SurfaceMaterial }[];
  } | null;
  capAt(x: number, z: number): number;
  heightInCell(x: number, z: number, cx: number, cz: number): number;
  retainedHeightInCell(x: number, z: number, cx: number, cz: number): number;
  resourceAt(x: number, z: number): V6SurfaceResource | null;
}
export interface V6SurfaceTriangle {
  readonly x: number;
  readonly z: number;
  readonly surface: 'natural' | 'cut' | 'wall' | 'coast';
  readonly resourceId: string | null;
  readonly material: V6SurfaceMaterial | 'grass';
}
export interface V6SurfaceMesh extends MeshData {
  triangles: V6SurfaceTriangle[];
}
export interface V6SurfaceChunk {
  key: string;
  /** False is display/occlusion only, never a support or editable authority. */
  detail?: boolean;
  mesh: V6SurfaceMesh;
  surface: NaturalSurfaceData;
  support?: V6SurfaceSupport;
}
export const v6Plane = (level: number): number => Math.fround(0.015 + level);
/** Ownership is fixed by original dry tops, never by current resource quantity. */
export const v6OwnsSurfaceCell = (world: V6SurfaceWorld, x: number, z: number): boolean => {
  const cell = world.at(x, z);
  return !!cell && !cell.reserved;
};
