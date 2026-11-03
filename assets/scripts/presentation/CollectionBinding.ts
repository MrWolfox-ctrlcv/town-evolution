import { collectionOrigin } from '../application/Collections';
import type { GameSession } from '../application/GameSession';
import type { MapCamera } from './MapCamera';
import type { TownHUD } from './TownHUD';
export function bindCollections(
  session: GameSession,
  map: MapCamera,
  hud: TownHUD,
  refresh: () => void,
): void {
  session.setCollectionListener((event) => {
    const world = collectionOrigin(event);
    const source = world ? map.project(world) : hud.collectionClick;
    refresh();
    if (source) for (const gain of event.gains) hud.collect(gain.kind, gain.amount, source);
  });
}
