export type StartPage =
  | 'title'
  | 'settings'
  | 'saves'
  | 'slot'
  | 'confirm'
  | 'exit'
  | 'game'
  | 'preparing';

/** Switching towns releases the old session before the replacement is prepared. */
export function preparationOrigin(page: StartPage, hasSession: boolean): StartPage {
  return !hasSession && (page === 'game' || page === 'settings') ? 'title' : page;
}
