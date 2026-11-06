import { createDemoGame } from '../domain/demo';
import type { GameState } from '../domain/types';
/** A fixed display clock keeps every crop stage intact; it is not a playable session. */
export const TITLE_ISLAND_TIME = 1700000000000;
/** Fresh template, never a saved demo. Freeze recursively to reject accidental progression. */
export function titleIsland(): GameState {
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child !== null && typeof child === 'object') freeze(child);
    Object.freeze(value);
  };
  const state = createDemoGame(TITLE_ISLAND_TIME);
  freeze(state);
  return state;
}
