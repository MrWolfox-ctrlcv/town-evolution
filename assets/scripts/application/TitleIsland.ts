import { TITLE_SNAPSHOT_JSON } from './TitleSnapshot';
import type { GameState } from '../domain/types';
/** A fixed display clock keeps every crop stage intact; it is not a playable session. */
export const TITLE_ISLAND_TIME = 1700000000000;
/** Fresh frozen view of the generated demo template. It never reads or changes player saves. */
export function titleIsland(): GameState {
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child !== null && typeof child === 'object') freeze(child);
    Object.freeze(value);
  };
  const state = JSON.parse(TITLE_SNAPSHOT_JSON) as GameState;
  freeze(state);
  return state;
}
