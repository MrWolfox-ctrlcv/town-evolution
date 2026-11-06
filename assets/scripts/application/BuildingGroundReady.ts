import { footprint } from '../domain/geometry';
import type { Building } from '../domain/types';
/** Display-only distant terrain never authorizes an object command on an unready foundation. */
export function buildingGroundReady(
  b: Building,
  ready: (x: number, z: number) => boolean,
): boolean {
  const size = footprint(b);
  for (let z = b.z; z < b.z + size.depth; z++)
    for (let x = b.x; x < b.x + size.width; x++) if (!ready(x, z)) return false;
  return true;
}
