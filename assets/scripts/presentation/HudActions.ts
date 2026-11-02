import { CONFIG, ORDERS, adjacent } from '../domain/game';
import type { Command } from '../domain/game';
import type { Action } from './Widgets';
import type { HudTab } from './TownHUD';
import type { PlacementPreview } from './TownView';
import type { GameSession } from '../application/GameSession';
export type PlaceKind = 'farm' | 'warehouse' | 'cooler';
export interface UiState {
  tab: HudTab;
  selected: string | null;
  placing: PlaceKind | null;
  preview: PlacementPreview | null;
  resetArmed: boolean;
}
export interface UiHandlers {
  command: (command: Command) => void;
  build: (kind: PlaceKind) => void;
  cancel: () => void;
  confirm: () => void;
  zoom: (delta: number) => void;
  save: () => void;
  reset: () => void;
}
function commandButton(
  session: GameSession,
  text: string,
  command: Command,
  handlers: UiHandlers,
): Action {
  const reason = session.reason(command);
  return {
    text,
    enabled: !reason,
    reason: reason ?? undefined,
    run: () => handlers.command(command),
  };
}
/** Maps current context to at most four actions. Rendering and commands remain separate. */
export function actions(session: GameSession, ui: UiState, handlers: UiHandlers): Action[] {
  if (ui.resetArmed)
    return [
      { text: '确认重置进度', caution: true, run: handlers.reset },
      { text: '取消', run: handlers.cancel },
    ];
  if (session.mode === 'corrupt')
    return [{ text: '重新开始…', caution: true, run: handlers.reset }];
  if (session.mode === 'recovered') return [{ text: '采用备份', run: handlers.save }];
  if (ui.placing)
    return [
      {
        text: `确认建造 · ${CONFIG.buildings[ui.placing].cost}`,
        enabled: Boolean(ui.preview?.valid),
        reason: ui.preview ? '位置不可用，请移动预览框' : '先点地图选择位置',
        run: handlers.confirm,
      },
      { text: '取消建造', run: handlers.cancel },
    ];
  if (ui.tab === 'build')
    return (['farm', 'warehouse', 'cooler'] as PlaceKind[]).map((kind) => ({
      text: `${CONFIG.buildings[kind].label} · ${CONFIG.buildings[kind].cost}`,
      enabled: session.state.coins >= CONFIG.buildings[kind].cost,
      reason: '金币不足，先完成订单',
      run: () => handlers.build(kind),
    }));
  if (ui.tab === 'orders')
    return (['vegetable', 'chilledVegetable'] as const).map((item) => {
      const order = ORDERS[item];
      const title = item === 'vegetable' ? '蔬菜' : '冷藏菜';
      return commandButton(
        session,
        `${title} ${order.amount} → ${order.reward}币`,
        { type: 'sell', orderId: item },
        handlers,
      );
    });
  if (ui.tab === 'tools')
    return [
      { text: '放大 ＋', run: () => handlers.zoom(-1) },
      { text: '缩小 －', run: () => handlers.zoom(1) },
      { text: '保存进度', run: handlers.save },
      { text: '重新开始…', caution: true, run: handlers.reset },
    ];
  const building = session.state.buildings.find((b) => b.id === ui.selected);
  if (!building) return [];
  const result: Action[] = [];
  if (building.kind === 'farm' || building.kind === 'coldWarehouse')
    result.push(
      commandButton(
        session,
        building.job
          ? '领取产物'
          : building.kind === 'farm'
            ? `开始种植 · ${CONFIG.cropDurationMs / 1000}秒`
            : `加工 · ${CONFIG.coldInput}蔬菜`,
        { type: building.job ? 'collect' : 'start', buildingId: building.id },
        handlers,
      ),
    );
  if (building.kind === 'warehouse') {
    result.push(
      commandButton(
        session,
        `扩容 · ${CONFIG.expansionCost}币`,
        { type: 'upgrade', buildingId: building.id, target: 'expandedWarehouse' },
        handlers,
      ),
    );
    const cooler = session.state.buildings.find(
      (b) => b.kind === 'cooler' && adjacent(building, b),
    );
    result.push(
      cooler
        ? commandButton(
            session,
            `组合冷库 · ${CONFIG.combineCost}币`,
            { type: 'combine', warehouseId: building.id, coolerId: cooler.id },
            handlers,
          )
        : {
            text: '组合冷藏库',
            enabled: false,
            reason: '先在仓房边缘旁建造制冷设施',
            run: () => {},
          },
    );
  }
  return result;
}
