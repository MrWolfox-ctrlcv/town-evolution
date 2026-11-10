import { terrainModeActions } from './TerrainModeActions';
import { materialQuantity } from '../application/MaterialQuantity';
import { productionActions, transportActions } from './RouteActions';
import {
  CONFIG,
  CROPS,
  ITEM_KEYS,
  hasTradeFacility,
  toolRefill,
  UNLIMITED_TOOL_DURABILITY,
} from '../domain/game';
import { TRAY_LABELS } from './TrayIcons';
import { commerceActions } from './CommercePanel';
import type { Command } from '../domain/game';
import type { Action } from './Widgets';
import type { GameSession } from '../application/GameSession';
import type { UiState, UiHandlers } from './UiContracts';
export type { UiState, UiHandlers } from './UiContracts';
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
/** Maps current context to the existing paged set of actions. Rendering and commands remain separate. */
export function actions(session: GameSession, ui: UiState, handlers: UiHandlers): Action[] {
  if (ui.repurposeId)
    return [
      { text: '确认改为订单板', caution: true, run: handlers.repurpose },
      { text: '取消', run: handlers.cancel },
    ];
  if (ui.resetArmed)
    return [
      {
        text:
          ui.profile === 'v5-bridge-demo'
            ? '确认重置木桥演示'
            : ui.profile === 'v5-preview'
              ? '确认重置 v5 预览岛'
              : ui.profile === 'demo'
                ? '确认重置演示岛'
                : '确认重置进度',
        caution: true,
        run: handlers.reset,
      },
      { text: '取消', run: handlers.cancel },
    ];
  const switchTown = {
    text: ui.profile === 'normal' ? '进入演示岛' : '进入正常小镇',
    run: handlers.switchTown,
  };
  if (session.mode === 'corrupt')
    return [{ text: '重新开始…', caution: true, run: handlers.reset }, switchTown];
  if (session.mode === 'recovered') return [{ text: '采用备份', run: handlers.save }, switchTown];
  if (ui.plantingTree) return [{ text: '取消种树', run: handlers.cancel }];
  if (ui.toolShopOpen && UNLIMITED_TOOL_DURABILITY) return [{ text: '关闭', run: handlers.cancel }];
  if (ui.toolShopOpen)
    return [
      ...(['sickle', 'axe', 'saw', 'hammer'] as const).map((tool) => {
        const label = { sickle: '镰刀', axe: '斧子', saw: '锯子', hammer: '锤子' }[tool];
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
  // A tray purchase must not inherit the previously selected object's actions.
  if (ui.cropShopOpen)
    return [
      ...(['vegetable', 'wheat', 'lettuce', 'rice'] as const).map((item) =>
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
  if (ui.selectedResource && ui.tab === 'manage' && !ui.selected && !ui.selectedPile) {
    const target = ui.selectedResource;
    if (target.kind === 'tree' && session.state.trees.some((t) => t.id === target.id))
      return [
        {
          ...commandButton(
            session,
            '砍树',
            { type: 'useTool', tool: 'axe', treeId: target.id },
            handlers,
          ),
          icon: 'axe',
        },
      ];
    const drop = target.kind === 'drop' && session.state.looseDrops.find((d) => d.id === target.id);
    if (drop)
      return [
        commandButton(
          session,
          `拾取 ${TRAY_LABELS[drop.item]} ×${materialQuantity(drop.amount)}`,
          { type: 'pickupDrop', dropId: drop.id },
          handlers,
        ),
      ];
    const resource = session.state.naturalResources.find((r) => r.id === target.id);
    if (target.kind === 'natural' && resource)
      return [
        {
          ...commandButton(
            session,
            resource.kind === 'stone' ? '采石' : '挖土',
            { type: 'gatherNatural', resourceId: target.id },
            handlers,
          ),
          icon: resource.kind === 'stone' ? 'digging-pickaxe' : 'digging-tool',
        },
      ];
  }
  if (ui.selectedPile && ui.tab === 'manage') {
    const pile = session.state.groundStacks.find(
      (p) => p.x === ui.selectedPile!.x && p.z === ui.selectedPile!.z,
    );
    if (pile)
      return [
        commandButton(
          session,
          `整堆收回 · ${materialQuantity(pile.amount)}`,
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
  if (ui.tab === 'orders') {
    const board = session.state.buildings.find((b) => b.kind === 'orderBoard');
    return board
      ? [{ text: '打开订单板', run: () => handlers.select(board.id) }]
      : [
          {
            text: '暂无订单板',
            enabled: false,
            reason: '还没有订单板，可在配方手册中查看已发现的合成',
            run: () => {},
          },
        ];
  }
  if (ui.tab === 'tools')
    return [
      ...(session.state.terrainVersion === 6 || session.state.terrainVersion === 7
        ? terrainModeActions(ui, handlers)
        : []),
      ...(!UNLIMITED_TOOL_DURABILITY ? [{ text: '工具补给', run: handlers.openToolShop }] : []),
      { text: '种树苗 · 5币', run: handlers.plantTree },
      { text: '存档', run: handlers.openSaves ?? handlers.save },
      { text: '购买作物', run: handlers.openCropShop },
      ...(handlers.overview ? [{ text: '查看全岛', run: handlers.overview }] : []),
      ...(!handlers.openSaves
        ? [
            {
              text:
                ui.profile === 'v5-bridge-demo'
                  ? '重置木桥演示…'
                  : ui.profile === 'v5-preview'
                    ? '重置 v5 预览岛…'
                    : ui.profile === 'demo'
                      ? '重置演示岛…'
                      : '重新开始…',
              caution: true,
              run: handlers.reset,
            },
          ]
        : []),
      { text: ui.profile === 'normal' ? '进入演示岛' : '进入正常小镇', run: handlers.switchTown },
      ...(handlers.exitToTitle ? [{ text: '退出到标题', run: handlers.exitToTitle }] : []),
    ];
  const commerce = commerceActions(session, ui, handlers);
  const building = session.state.buildings.find((b) => b.id === ui.selected);
  if (!building)
    return (
      commerce ??
      (session.state.terrainVersion === 6 || session.state.terrainVersion === 7
        ? terrainModeActions(ui, handlers)
        : [])
    );
  const routeActions =
    productionActions(session, building, handlers, ui) ??
    transportActions(session, building, ui, handlers);
  const attached = session.state.fusion.attachments[building.id];
  const result: Action[] = [];
  const firstAttached = attached && ITEM_KEYS.find((item) => attached[item] > 0);
  if (firstAttached)
    result.push(
      commandButton(
        session,
        `取回${TRAY_LABELS[firstAttached]} ×1`,
        { type: 'detachMaterial', buildingId: building.id, item: firstAttached, quantity: 1 },
        handlers,
      ),
    );
  if (routeActions) return [...result, ...routeActions];
  if (commerce) {
    if (result.length + commerce.length <= 6) return [...result, ...commerce];
    return ui.moreBuildingActions
      ? [...result, ...commerce.slice(5), { text: '返回交易', run: handlers.toggleBuildingActions }]
      : [...commerce.slice(0, 5), { text: '更多 / 材料', run: handlers.toggleBuildingActions }];
  }
  if (building.kind === 'coldWarehouse' && building.job)
    result.push(
      commandButton(
        session,
        building.job ? '领取产物' : `加工 · ${CONFIG.coldInput}蔬菜`,
        { type: building.job ? 'collect' : 'start', buildingId: building.id },
        handlers,
      ),
    );
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
    ui.plantingTree ||
    ui.resetArmed ||
    ui.repurposeId ||
    ui.cropShopOpen ||
    ui.toolShopOpen ||
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
