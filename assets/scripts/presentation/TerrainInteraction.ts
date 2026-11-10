import { Vec3 } from 'cc';
import type { geometry } from 'cc';
import type { Building, GameState } from '../domain/game';
import { validatePlacement } from '../domain/geometry';
import { getV6EditSurface } from '../domain/v6-edit-surface';
import type { TownView } from './TownView';
/** Published triangle ownership is authoritative, including a vertical wall at a cell boundary. */
export function terrainContact(town: TownView, ray: geometry.Ray): Vec3 | null {
  const hit = town.pickTerrain(ray);
  if (!hit) return null;
  return new Vec3(
    Math.max(hit.x + 0.00001, Math.min(hit.x + 0.99999, hit.point.x)),
    hit.point.y,
    Math.max(hit.z + 0.00001, Math.min(hit.z + 0.99999, hit.point.z)),
  );
}
export function terrainHeight(state: GameState, x: number, z: number): number {
  if (state.terrainVersion !== 6 && state.terrainVersion !== 7) return 0;
  try {
    return getV6EditSurface(state).range(Math.floor(x), Math.floor(z))[1];
  } catch {
    return 0;
  }
}
/** Validation may assign elevation to this temporary copy, never to an authoritative building. */
export function buildingPreview(state: GameState, building: Building): Building {
  if (state.terrainVersion !== 6 && state.terrainVersion !== 7) return building;
  const result = { ...building };
  try {
    validatePlacement(state, result);
  } catch {
    result.baseElevation = terrainHeight(state, result.x, result.z);
  }
  return result;
}
