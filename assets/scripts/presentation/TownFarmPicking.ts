import type { geometry } from 'cc';
import type { FarmToolSurface } from '../application/FarmPicking';
import type { BuildingVisualEntry } from './TownViewContracts';
import type { GroundObjects } from './GroundObjects';
export function townFarmToolSurface(
  ray: geometry.Ray,
  buildings: ReadonlyMap<string, BuildingVisualEntry>,
  lifted: string | null,
  resources: GroundObjects,
  terrainDistance: ((ray: geometry.Ray) => number | null) | null,
  buildingReady: (id: string) => boolean,
) {
  let nearest: FarmToolSurface | null = null;
  for (const [id, entry] of buildings) {
    if (id === lifted) continue;
    const crop = entry.kind === 'farm' ? entry.crops : null;
    const hit = entry.surface.hit(ray, nearest?.distance, (node) => crop?.cellAt(node) != null);
    if (!hit) continue;
    const cell = crop?.cellAt(hit.node) ?? null;
    if (
      !nearest ||
      hit.distance < nearest.distance ||
      (hit.distance === nearest.distance && cell !== null && nearest.cell === null)
    )
      nearest = {
        buildingId: id,
        cell,
        soil: crop?.isSoil(hit.node) ?? false,
        distance: hit.distance,
      };
  }
  const tree = resources.pickTree(ray),
    pile = resources.pickStack(ray);
  const natural = resources.pickNatural(ray);
  for (const blocker of [tree, pile, natural, resources.pickDrop?.(ray)])
    if (blocker && blocker.distance < (nearest?.distance ?? Infinity))
      nearest = { buildingId: null, cell: null, soil: false, distance: blocker.distance };
  const ground = terrainDistance?.(ray) ?? null;
  if (nearest?.buildingId && !buildingReady(nearest.buildingId)) return null;
  return nearest && ground !== null && nearest.distance > ground + 0.015 ? null : nearest;
}
