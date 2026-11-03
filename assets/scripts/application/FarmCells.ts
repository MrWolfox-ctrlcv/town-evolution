import type { Building } from '../domain/game';
/** Cell index is local row * 3 + column; inverse yaw keeps it stable after rotation. */
export function farmCellAt(building: Building, point: { x: number; z: number }): number | null {
  if (building.kind !== 'farm' || !Number.isFinite(point.x) || !Number.isFinite(point.z))
    return null;
  const dx = point.x - (building.x + 1),
    dz = point.z - (building.z + 1);
  const turns = building.rotation;
  const x = [dx, -dz, -dx, dz][turns]! + 1;
  const z = [dz, dx, -dz, -dx][turns]! + 1;
  if (x < 0 || x >= 2 || z < 0 || z >= 2) return null;
  return Math.floor(z * 1.5) * 3 + Math.floor(x * 1.5);
}

export function farmCellCenter(building: Building, cell: number): { x: number; z: number } {
  const x = (((cell % 3) + 0.5) * 2) / 3 - 1,
    z = ((Math.floor(cell / 3) + 0.5) * 2) / 3 - 1;
  return {
    x: building.x + 1 + [x, z, -x, -z][building.rotation]!,
    z: building.z + 1 + [z, -x, -z, x][building.rotation]!,
  };
}
