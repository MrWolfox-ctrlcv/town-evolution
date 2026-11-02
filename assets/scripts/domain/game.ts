/** Public business-layer facade. Rendering and storage depend on this layer, never the reverse. */
export * from './types';
export { CONFIG, ORDERS } from './config';
export { createGame, advance, getCapacity, getUsedStorage } from './state';
export { footprint, adjacent } from './geometry';
export { importSave, exportSave, SaveVersionError } from './save';
import type { GameState, Command, Result } from './types';
import { clone } from './state';
import { time, requireRule } from './guards';
import { place, upgrade, combine } from './actions/construction';
import { start, collect } from './actions/production';
import { sell } from './actions/orders';

/** Rejected actions retain the exact original object; successful actions publish a new snapshot. */
export function dispatch(state: GameState, command: Command, now: number): Result {
  try {
    time(now);
    requireRule(command && typeof command === 'object', '操作无效');
    const next = clone(state);
    const effectiveNow = Math.max(state.lastSeenAt, now);
    let events: string[];
    switch (command.type) {
      case 'place':
        events = place(next, command, effectiveNow);
        break;
      case 'upgrade':
        events = upgrade(next, command, effectiveNow);
        break;
      case 'combine':
        events = combine(next, command, effectiveNow);
        break;
      case 'start':
        events = start(next, command, effectiveNow);
        break;
      case 'collect':
        events = collect(next, command, effectiveNow);
        break;
      case 'sell':
        events = sell(next, command, effectiveNow);
        break;
      default:
        throw new Error('未知操作');
    }
    next.lastSeenAt = effectiveNow;
    return { ok: true, state: next, events };
  } catch (error) {
    return { ok: false, state, error: error instanceof Error ? error.message : '操作失败' };
  }
}
