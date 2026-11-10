import type { Command } from '../domain/game';
import type { MixedCraftSelection } from '../application/MixedCraftSelection';
import type { EntityAssemblySelection } from '../application/EntityAssemblySelection';
import type { GameSession } from '../application/GameSession';
import type { Point } from '../application/MapGesture';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
/** First explicit source fixes the gesture mode. No cross-mode fallback or source replacement. */
export function hammerTarget(
  session: GameSession,
  town: TownView,
  map: MapCamera,
  point: Point,
  mixed: MixedCraftSelection,
  entities: EntityAssemblySelection,
): Command | null {
  mixed.observe(session.state);
  entities.observe(session.state);
  if (mixed.invalid || entities.invalid) return null;
  const ray = map.screenRay(point),
    buildingId = town.pickBuilding(ray);
  if (buildingId) {
    // An attached-material upgrade belongs to the building under the pointer.
    // Merely crossing another building on the way must not turn it into an assembly.
    const attached = session.state.fusion.attachments[buildingId];
    const single: Command = { type: 'useTool', tool: 'hammer', buildingId };
    if (attached && Object.values(attached).some((amount) => amount > 0)) {
      if (session.reason(single) === null) return single;
    }
    if (mixed.selected.length) return null;
    entities.observe(session.state, buildingId);
    if (!entities.selected.some((s) => s.id === buildingId)) return null;
    return entities.selected.length > 1
      ? entities.command()
      : { type: 'useTool', tool: 'hammer', buildingId };
  }
  if (
    entities.selected.length ||
    town.pickTree(ray) ||
    town.pickNatural(ray) ||
    town.pickDrop?.(ray)
  )
    return null;
  const pile = town.pickStack(ray);
  if (pile) mixed.observe(session.state, pile);
  if (mixed.complete) {
    const target = pile ?? map.ground(point);
    return target ? mixed.command(Math.floor(target.x), Math.floor(target.z)) : null;
  }
  return pile ? { type: 'useTool', tool: 'hammer', x: pile.x, z: pile.z } : null;
}
