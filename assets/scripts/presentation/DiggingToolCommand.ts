import type { geometry } from 'cc';
import type { Command } from '../domain/game';
import type { Point } from '../application/MapGesture';
import type { GameSession } from '../application/GameSession';
import type { TownView } from './TownView';
import type { MapCamera } from './MapCamera';
/** Legacy digging remains farming; v6 terrain edits use their explicit mode instead. */
export function diggingToolCommand(
  session: GameSession,
  town: TownView,
  map: MapCamera,
  point: Point,
  ray: geometry.Ray,
): Command | null {
  const resourceId = town.pickNatural(ray);
  const resource = session.state.naturalResources.find((entry) => entry.id === resourceId);
  if (resource && (session.state.terrainVersion === 6 || session.state.terrainVersion === 7))
    return null;
  if (resource) return { type: 'gatherNatural', resourceId: resource.id };
  if (town.pickBuilding(ray) || town.pickTree(ray) || town.pickStack(ray)) return null;
  const ground = map.ground(point);
  const cell =
    session.state.terrainVersion === 6 || session.state.terrainVersion === 7
      ? town.pickTerrain(ray)
      : null;
  return ground
    ? {
        type: 'useTool',
        tool: 'diggingTool',
        x: cell?.x ?? Math.floor(ground.x),
        z: cell?.z ?? Math.floor(ground.z),
      }
    : null;
}
