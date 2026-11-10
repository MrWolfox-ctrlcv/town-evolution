import type { SurfacePoint } from '../application/NaturalPicking';
import { collectionOrigin } from '../application/Collections';
import type { GameSession } from '../application/GameSession';
import type { MapCamera } from './MapCamera';
import type { TownHUD } from './TownHUD';
export function bindCollections(
  session: GameSession,
  map: MapCamera,
  hud: TownHUD,
  refresh: () => void,
  origins:
    | ((id: string) => SurfacePoint | null)
    | {
        naturalOrigin(id: string): SurfacePoint | null;
        dropOrigin(id: string): SurfacePoint | null;
        stackOrigin?(x: number, z: number): SurfacePoint | null;
      },
): void {
  session.setCollectionListener((event) => {
    const world = collectionOrigin(
      event,
      typeof origins === 'function' ? origins : (id) => origins.naturalOrigin(id),
      typeof origins === 'function' ? undefined : (id) => origins.dropOrigin(id),
      typeof origins === 'function' ? undefined : (x, z) => origins.stackOrigin?.(x, z) ?? null,
    );
    const source = world ? map.project(world) : hud.collectionClick;
    refresh();
    if (source) for (const gain of event.gains) hud.collect(gain.kind, gain.amount, source);
  });
}
