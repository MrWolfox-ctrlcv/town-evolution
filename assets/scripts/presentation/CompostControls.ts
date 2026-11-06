import { COMPOST_ITEMS, compostOccupied, compostStage } from '../domain/game';
import type { Building, Command } from '../domain/game';
import type { GameSession } from '../application/GameSession';
import type { UiHandlers, UiState } from './UiContracts';
import type { Action } from './Widgets';
import { TRAY_LABELS } from './TrayIcons';

/** Inputs are explicit drags; only unreserved stock can be withdrawn. */
export function compostActions(
  session: GameSession,
  building: Building,
  handlers: UiHandlers,
  ui?: UiState,
): Action[] {
  const state = building.compost;
  if (!state) return [];
  const button = (text: string, command: Command): Action => {
    const reason = session.reason(command);
    return {
      text,
      enabled: !reason,
      reason: reason ?? undefined,
      run: () => handlers.command(command),
    };
  };
  const rows: Action[] = [];
  if (state.job)
    rows.push(
      button(`领取肥料 ×${state.job.fertilizerYield}`, {
        type: 'collectCompost',
        buildingId: building.id,
        jobId: state.job.id,
      }),
    );
  const stock = COMPOST_ITEMS.filter((item) => state.stock[item] > 0);
  if (ui && stock.length)
    rows.push({
      text: `取回数量：${ui.quantity === 'all' ? '全部' : ui.quantity} ↻`,
      run: handlers.quantity,
    });
  for (const item of stock) {
    const quantity =
      ui?.quantity === 'all' ? state.stock[item] : Math.min(state.stock[item], ui?.quantity ?? 1);
    rows.push(
      button(`取回待加工${TRAY_LABELS[item]} ×${quantity}`, {
        type: 'withdrawCompostInput',
        buildingId: building.id,
        item,
        quantity,
      }),
    );
  }
  rows.push({ text: '拖入作物或树种 · 肥料用途待设计', enabled: false, run: () => {} });
  return rows;
}
export function compostDescription(session: GameSession, building: Building): string {
  const state = building.compost;
  if (!state) return '堆肥木桶';
  const now = Math.max(Date.now(), session.state.lastSeenAt);
  const stage = compostStage(state, now);
  const pending = COMPOST_ITEMS.filter((item) => state.stock[item] > 0)
    .map((item) => `${TRAY_LABELS[item]}${state.stock[item]}`)
    .join(' ');
  const status =
    stage === 'ready'
      ? '肥料可领取'
      : stage === 'working'
        ? `堆肥中 ${Math.max(0, Math.ceil((state.job!.readyAt - now) / 1000))}秒`
        : '拖入作物或树种';
  return `堆肥木桶 ${compostOccupied(state)}/${state.capacity} · ${status}${pending ? ` · 待加工 ${pending}` : ''} · 肥料用途待设计`;
}
