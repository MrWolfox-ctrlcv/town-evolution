import type { Command } from '../domain/game';
import type { MixedCraftSelection } from '../application/MixedCraftSelection';
import type { EntityAssemblySelection } from '../application/EntityAssemblySelection';
import type { GameSession } from '../application/GameSession';
import type { Point } from '../application/MapGesture';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
/** Completed recipes lock their sources; incidental building hover cannot hijack a pile drop. */
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
    // Routing is read-only: the shared hover preview validates once; release validates
    // again in run(). Invalid attached materials must not fall back to another recipe.
    if (attached && Object.values(attached).some((amount) => amount > 0)) return single;
    if (mixed.selected.length) return null;
    entities.observe(session.state, buildingId);
    if (!entities.selected.some((s) => s.id === buildingId)) return null;
    return entities.selected.length > 1
      ? entities.command()
      : { type: 'useTool', tool: 'hammer', buildingId };
  }
  if (town.pickTree(ray) || town.pickNatural(ray) || town.pickDrop?.(ray)) return null;
  const pile = town.pickStack(ray);
  if (entities.selected.length) {
    // Unrelated buildings crossed en route cannot hijack a deliberate pile drop.
    // A complete entity assembly remains locked, as do invalid/stale selections above.
    return pile && !entities.plan(session.state)
      ? { type: 'useTool', tool: 'hammer', x: pile.x, z: pile.z }
      : null;
  }
  if (pile) mixed.observe(session.state, pile);
  if (mixed.complete) {
    const target = pile ?? map.ground(point);
    return target ? mixed.command(Math.floor(target.x), Math.floor(target.z)) : null;
  }
  return pile ? { type: 'useTool', tool: 'hammer', x: pile.x, z: pile.z } : null;
}
