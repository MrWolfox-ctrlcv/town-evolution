import type { Building } from '../domain/types';
import { footprint } from '../domain/geometry';
import { getV6World } from '../domain/v6-world';
import { bridgeSupports, BRIDGE_ROOT_HEIGHT } from './WoodenBridgeKit';
import { V5_COAST_STEP } from './V5CoastMesh';
import { V5_PIER_BED_LOWER, V5_PIER_EMBED } from './V5PierFootings';
/** Lower bound of every real coast triangle intersecting a post's complete cross-section.
 * Outside the cliff patch, each .25 lattice triangle is a convex combination of its
 * corners. Sample every covering cell corner, including cells crossing the foot edge.
 * The cliff patch has discontinuous walls: use its proven global bed lower bound. */
export function v6BridgeBedLower(mapSeed: number, x: number, z: number, halfWidth: number): number {
  const hydro = getV6World(mapSeed).hydrology,
    step = V5_COAST_STEP;
  const minX = Math.floor((x - halfWidth) / step) * step,
    maxX = Math.ceil((x + halfWidth) / step) * step,
    minZ = Math.floor((z - halfWidth) / step) * step,
    maxZ = Math.ceil((z + halfWidth) / step) * step;
  const bounds = hydro.featureBounds;
  if (minX <= bounds.x1 && maxX >= bounds.x0 && minZ <= bounds.z1 && maxZ >= bounds.z0)
    return V5_PIER_BED_LOWER;
  let lower = Infinity;
  for (let px = minX; px <= maxX; px += step)
    for (let pz = minZ; pz <= maxZ; pz += step)
      lower = Math.min(lower, hydro.sample(px, pz).height);
  return lower;
}
/** Transform only placements; geometry/material cache keys never contain coordinates. */
export function v6BridgeFootings(building: Building, mapSeed: number) {
  if (building.kind !== 'woodenBridge' || !building.bridge) return [];
  const f = footprint(building),
    a = (building.rotation * Math.PI) / 2;
  return bridgeSupports(building.bridge.length).flatMap((p) => {
    const worldX = building.x + f.width / 2 + p.x * Math.cos(a) + p.z * Math.sin(a),
      worldZ = building.z + f.depth / 2 - p.x * Math.sin(a) + p.z * Math.cos(a),
      bottom =
        v6BridgeBedLower(mapSeed, worldX, worldZ, p.halfWidth) - V5_PIER_EMBED - BRIDGE_ROOT_HEIGHT;
    if (bottom >= p.top) return []; // Original post is already embedded in a dry bank.
    return [
      { x: p.x, z: p.z, y: (p.top + bottom) / 2, height: p.top - bottom, width: p.halfWidth * 2 },
    ];
  });
}
