import type { GameState } from './types';
import { getV6EditSurface } from './v6-edit-surface';
import { v6EditPlane as plane, V6_EDIT_MAX_LEVEL } from './v6-material-volume';
/** First natural dig never implicitly fills low corners; natural fill never shaves high corners. */
export function terrain6EditLevel(
  state: GameState,
  x: number,
  z: number,
  kind: 'dig' | 'fill',
): number | null {
  const [lo, hi] = getV6EditSurface(state).range(x, z);
  if (kind === 'dig') {
    for (let level = V6_EDIT_MAX_LEVEL; level >= 0; level--)
      if (plane(level) <= lo && plane(level) < hi) return level;
  } else {
    for (let level = 0; level <= V6_EDIT_MAX_LEVEL; level++)
      if (plane(level) >= hi && plane(level) > lo) return level;
  }
  return null;
}
