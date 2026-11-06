import type { Building } from './types';
import { integer, requireRule } from './guards';
/** Integer sixth-tile coordinates retain exact centers for both field sizes and all rotations. */
export function farmCellCenterSixths(farm: Building, cell: number): { x6: number; z6: number } {
  const size = farm.farmSize === 6 ? 6 : 3;
  requireRule(farm.kind === 'farm' && integer(cell, size * size - 1), '田地小格无效');
  const span6 = size * 4,
    x = (cell % size) * 4 + 2 - span6 / 2,
    z = Math.floor(cell / size) * 4 + 2 - span6 / 2;
  return {
    x6: farm.x * 6 + span6 / 2 + [x, z, -x, -z][farm.rotation]!,
    z6: farm.z * 6 + span6 / 2 + [z, -x, -z, x][farm.rotation]!,
  };
}
export function farmCellAtSixths(farm: Building, point: { x6: number; z6: number }): number | null {
  if (farm.kind !== 'farm') return null;
  const size = farm.farmSize === 6 ? 6 : 3,
    span6 = size * 4;
  const dx = point.x6 - farm.x * 6 - span6 / 2,
    dz = point.z6 - farm.z * 6 - span6 / 2;
  const x = [dx, -dz, -dx, dz][farm.rotation]! + span6 / 2,
    z = [dz, dx, -dz, -dx][farm.rotation]! + span6 / 2;
  if (x < 0 || x >= span6 || z < 0 || z >= span6) return null;
  return Math.floor(z / 4) * size + Math.floor(x / 4);
}
