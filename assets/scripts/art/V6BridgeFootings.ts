import type { Building } from '../domain/types';
import { footprint } from '../domain/geometry';
import { getEditableWorld } from '../domain/editable-world';
import type { TerrainVersion } from '../domain/world';
import { v6BridgeProfile, v6BridgeWorldPoint } from '../domain/v6-bridge-profile';
import { bridgeSupports } from './WoodenBridgeKit';
import { V5_COAST_STEP } from './V5CoastMesh';
import { V5_PIER_BED_LOWER, V5_PIER_EMBED } from './V5PierFootings';
/** Lower bound of every real coast triangle intersecting a post's complete cross-section.
 * Outside the cliff patch, each .25 lattice triangle is a convex combination of its
 * corners. Sample every covering cell corner, including cells crossing the foot edge.
 * The cliff patch has discontinuous walls: use its proven global bed lower bound. */
export function v6BridgeBedLower(
  mapSeed: number,
  x: number,
  z: number,
  halfWidth: number,
  version: TerrainVersion = 6,
): number {
  const hydro = getEditableWorld(mapSeed, version).hydrology,
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
      lower = Math.min(lower, getEditableWorld(mapSeed, version).groundHeight(px, pz));
  return lower;
}
/** Transform only placements; geometry/material cache keys never contain coordinates. */
export function v6BridgeFootings(building: Building, mapSeed: number, version: TerrainVersion = 6) {
  if (building.kind !== 'woodenBridge' || !building.bridge) return [];
  const placement = { ...building, length: building.bridge.length },
    profile = v6BridgeProfile(mapSeed, placement, version);
  return bridgeSupports(building.bridge.length).flatMap((p) => {
    const point = v6BridgeWorldPoint(placement, p.x, p.z),
      top = p.top + profile.height(p.x, p.z) - profile.deck,
      bottom =
        v6BridgeBedLower(mapSeed, point.x, point.z, p.halfWidth, version) -
        V5_PIER_EMBED -
        profile.root;
    if (bottom >= top) return [];
    return [
      { x: p.x, z: p.z, y: (top + bottom) / 2, height: top - bottom, width: p.halfWidth * 2 },
    ];
  });
}
/** Natural sloped river banks need real supports even before the two piers merge. */
export function v6RiverPierFootings(
  building: Building,
  seed: number,
  base: number,
  version: TerrainVersion = 6,
) {
  const f = footprint(building),
    a = (building.rotation * Math.PI) / 2;
  return [-0.72, 0.72].flatMap((z) =>
    [-0.76, 0.76].flatMap((x) => {
      const worldX = building.x + f.width / 2 + x * Math.cos(a) + z * Math.sin(a),
        worldZ = building.z + f.depth / 2 - x * Math.sin(a) + z * Math.cos(a),
        top = -0.155,
        bottom = v6BridgeBedLower(seed, worldX, worldZ, 0.115, version) - V5_PIER_EMBED - base;
      return bottom < top
        ? [{ x, z, y: (top + bottom) / 2, height: top - bottom, width: 0.23 }]
        : [];
    }),
  );
}
