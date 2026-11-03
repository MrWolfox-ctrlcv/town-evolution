import { CONFIG, CROPS, hasTradeFacility, toolRefill } from '../domain/game';
import { commerceActions } from './CommercePanel';
import type { Command } from '../domain/game';
import type { Action } from './Widgets';
import type { GameSession } from '../application/GameSession';
import type { UiState, UiHandlers, PlaceKind } from './UiContracts';
export type { UiState, UiHandlers, PlaceKind } from './UiContracts';
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
  if (ui.repurposeId)
    return [
      { text: '确认改为订单板', caution: true, run: handlers.repurpose },
      { text: '取消', run: handlers.cancel },
    ];
  if (ui.resetArmed)
    return [
      {
        text: ui.profile === 'demo' ? '确认重置演示岛' : '确认重置进度',
        caution: true,
        run: handlers.reset,
      },
      { text: '取消', run: handlers.cancel },
    ];
  const switchTown = {
    text: ui.profile === 'demo' ? '进入正常小镇' : '进入演示岛',
    run: handlers.switchTown,
  };
  if (session.mode === 'corrupt')
    return [{ text: '重新开始…', caution: true, run: handlers.reset }, switchTown];
  if (session.mode === 'recovered') return [{ text: '采用备份', run: handlers.save }, switchTown];
  if (ui.plantingTree) return [{ text: '取消种树', run: handlers.cancel }];
  if (ui.toolShopOpen)
    return [
      ...(['sickle', 'axe', 'saw'] as const).map((tool) => {
        const label = { sickle: '镰刀', axe: '斧子', saw: '锯子' }[tool];
        const rescue = !session.reason({ type: 'recoverTool', tool });
        return commandButton(
          session,
          rescue ? `${label} · 应急补充` : `${label} +${toolRefill(tool)}耐久 · 10币`,
          rescue ? { type: 'recoverTool', tool } : { type: 'buyTool', tool },
          handlers,
        );
      }),
      { text: '关闭', run: handlers.cancel },
    ];
  if (ui.selectedPile && ui.tab === 'manage') {
    const pile = session.state.groundStacks.find(
      (p) => p.x === ui.selectedPile!.x && p.z === ui.selectedPile!.z,
    );
    if (pile)
      return [
        commandButton(
          session,
          `整堆收回 · ${pile.amount}`,
          { type: 'pickupStack', x: pile.x, z: pile.z },
          handlers,
        ),
        commandButton(
          session,
          '收回1份',
          { type: 'pickupProduct', item: pile.item, x: pile.x, z: pile.z },
          handlers,
        ),
      ];
  }
  if (ui.cropShopOpen)
    return [
      ...(['vegetable', 'wheat', 'lettuce'] as const).map((item) =>
        commandButton(
          session,
          `${CROPS[item].label} ×1 · ${CROPS[item].buy}币`,
          { type: 'buyCrop', item, quantity: 1 },
          handlers,
        ),
      ),
      ...(session.state.cropRecoveryAvailable
        ? [commandButton(session, '应急种苗', { type: 'recoverCrop' }, handlers)]
        : []),
      { text: '关闭', run: handlers.cancel },
    ];
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
    return (['farm', 'shop', 'orderBoard', 'dock'] as PlaceKind[]).map((kind) => ({
      text: `${CONFIG.buildings[kind].label} · ${CONFIG.buildings[kind].cost}`,
      enabled: session.state.coins >= CONFIG.buildings[kind].cost,
      reason: '金币不足，先完成订单',
      run: () => handlers.build(kind),
    }));
  if (ui.tab === 'orders') {
    const board = session.state.buildings.find((b) => b.kind === 'orderBoard');
    return board
      ? [{ text: '打开订单板', run: () => handlers.select(board.id) }]
      : [
          {
            text: `建造订单板 · ${CONFIG.buildings.orderBoard.cost === 0 ? '免费' : CONFIG.buildings.orderBoard.cost}`,
            run: () => handlers.build('orderBoard'),
          },
        ];
  }
  if (ui.tab === 'tools')
    return [
      { text: '工具补给', run: handlers.openToolShop },
      { text: '种树苗 · 5币', run: handlers.plantTree },
      { text: '保存进度', run: handlers.save },
      { text: '购买作物', run: handlers.openCropShop },
      {
        text: ui.profile === 'demo' ? '重置演示岛…' : '重新开始…',
        caution: true,
        run: handlers.reset,
      },
      { text: ui.profile === 'demo' ? '进入正常小镇' : '进入演示岛', run: handlers.switchTown },
    ];
  const commerce = commerceActions(session, ui, handlers);
  if (commerce) return commerce;
  const building = session.state.buildings.find((b) => b.id === ui.selected);
  if (!building) return [];
  const result: Action[] = [];
  if (building.kind === 'coldWarehouse' && building.job)
    result.push(
      commandButton(
        session,
        building.job ? '领取产物' : `加工 · ${CONFIG.coldInput}蔬菜`,
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
  }
  if (
    !hasTradeFacility(session.state) &&
    !building.job &&
    ['farm', 'cooler'].includes(building.kind) &&
    !session.reason({ type: 'repurposeToBoard', buildingId: building.id })
  )
    result.push({ text: '改为订单板…', run: handlers.repurpose });
  return result;
}

export function rotationAction(
  session: GameSession,
  ui: UiState,
  handlers: UiHandlers,
): Action | null {
  if (
    !ui.selected ||
    ui.placing ||
    ui.plantingTree ||
    ui.resetArmed ||
    ui.repurposeId ||
    ui.tab !== 'manage'
  )
    return null;
  if (!session.state.buildings.some((b) => b.id === ui.selected)) return null;
  return commandButton(
    session,
    '转向',
    { type: 'rotateBuilding', buildingId: ui.selected },
    handlers,
  );
}
