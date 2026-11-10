import type { GameState } from '../domain/game';
import type { WorldViewBounds } from '../application/TreeStreaming';
import type { IslandView } from './IslandView';
import type { GroundObjects } from './GroundObjects';
/** Publish terrain before refreshing its supported objects and invalidating picks. */
export function townGroundFrame(
  state: GameState,
  island: IslandView,
  resources: GroundObjects,
  terrain: Readonly<Parameters<IslandView['frame']>>,
  treeBounds: WorldViewBounds,
  treeLodSpan?: number,
): boolean {
  const changed = island.frame(...terrain);
  if (changed)
    resources.sync(
      state,
      island.naturalSurface,
      Math.max(Date.now(), state.lastSeenAt),
      island.dropSupport,
    );
  return resources.frame(treeBounds, treeLodSpan) || changed;
}
