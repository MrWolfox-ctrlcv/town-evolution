import type { Building } from '../domain/game';
import { farmGridSize } from '../domain/farming';
/** Crop cells retain their world scale; large fields have six rather than three per edge. */
export function farmCellAt(building: Building, point: { x: number; z: number }): number | null {
  if (building.kind !== 'farm' || !Number.isFinite(point.x) || !Number.isFinite(point.z))
    return null;
  const size = farmGridSize(building),
    span = (size * 2) / 3;
  const dx = point.x - (building.x + span / 2),
    dz = point.z - (building.z + span / 2);
  const turns = building.rotation;
  const x = [dx, -dz, -dx, dz][turns]! + span / 2;
  const z = [dz, dx, -dz, -dx][turns]! + span / 2;
  if (x < 0 || x >= span || z < 0 || z >= span) return null;
  return Math.floor(z * 1.5) * size + Math.floor(x * 1.5);
}
/** Reuse the visible surface hit. Distance is the original ray parameter, not a new plane. */
export function farmCellAtHit(
  building: Building,
  ray: { o: { x: number; z: number }; d: { x: number; z: number } },
  distance: number,
): number | null {
  if (!Number.isFinite(distance) || distance < 0) return null;
  return farmCellAt(building, {
    x: ray.o.x + ray.d.x * distance,
    z: ray.o.z + ray.d.z * distance,
  });
}
export function farmCellCenter(building: Building, cell: number): { x: number; z: number } {
  const size = farmGridSize(building),
    span = (size * 2) / 3;
  const x = (((cell % size) + 0.5) * 2) / 3 - span / 2;
  const z = ((Math.floor(cell / size) + 0.5) * 2) / 3 - span / 2;
  return {
    x: building.x + span / 2 + [x, z, -x, -z][building.rotation]!,
    z: building.z + span / 2 + [z, -x, -z, x][building.rotation]!,
  };
}
