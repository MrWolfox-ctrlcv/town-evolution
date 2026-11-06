import { compostActions } from './CompostControls';
import { CONFIG, PROCESSING_RECIPES, nurseryStage, CROP_KEYS } from '../domain/game';
import type { Building, Command, ProcessingRecipeId } from '../domain/game';
import type { GameSession } from '../application/GameSession';
import { tradeQuantity, nextTransportTarget } from '../application/CommerceSelection';
import type { UiState, UiHandlers } from './UiContracts';
import type { Action } from './Widgets';
import { TRAY_LABELS } from './TrayIcons';

function button(
  session: GameSession,
  handlers: UiHandlers,
  text: string,
  command: Command,
): Action {
  const reason = session.reason(command);
  return {
    text,
    enabled: !reason,
    reason: reason ?? undefined,
    run: () => handlers.command(command),
  };
}
/** Production buttons dispatch the exact snapshotted job token, never a stale new recipe. */
export function productionActions(
  session: GameSession,
  building: Building,
  handlers: UiHandlers,
  ui?: UiState,
): Action[] | null {
  if (building.kind === 'compostBarrel') return compostActions(session, building, handlers, ui);
  if (building.kind === 'farm' && building.collectionBox) {
    const box = building.collectionBox;
    const rows = CROP_KEYS.filter((item) => box.stock[item] > 0).map((item) => {
      const quantity =
        ui?.quantity === 'all' ? box.stock[item] : Math.min(box.stock[item], ui?.quantity ?? 1);
      return button(session, handlers, `取回${TRAY_LABELS[item]} ×${quantity}`, {
        type: 'withdrawFarmBox',
        buildingId: building.id,
        item,
        quantity,
      });
    });
    return [
      ...(ui && rows.length
        ? [
            {
              text: `数量：${ui.quantity === 'all' ? '全部' : ui.quantity} ↻`,
              run: handlers.quantity,
            },
          ]
        : []),
      ...rows,
      ...(!rows.length ? [{ text: '田箱空 · 镰刀手动收割', enabled: false, run: () => {} }] : []),
    ];
  }
  if (building.kind === 'nursery') {
    const stage = nurseryStage(building, Math.max(Date.now(), session.state.lastSeenAt));
    if (stage === 'empty')
      return [
        button(session, handlers, '放入树种 ×1', { type: 'seedNursery', buildingId: building.id }),
      ];
    if (stage === 'seeded')
      return [
        button(session, handlers, '浇水育苗', {
          type: 'useTool',
          tool: 'wateringCan',
          buildingId: building.id,
        }),
      ];
    return [button(session, handlers, '领取树苗', { type: 'collect', buildingId: building.id })];
  }
  if (!['mill', 'bakery', 'stoneOven'].includes(building.kind)) return null;
  const job = building.processingJob;
  if (job)
    return [
      button(
        session,
        handlers,
        `领取${job.outputs.map((line) => `${TRAY_LABELS[line.item]} ×${line.amount}`).join('、')}`,
        { type: 'collectProcessing', buildingId: building.id, jobId: job.id },
      ),
    ];
  return (Object.keys(PROCESSING_RECIPES) as ProcessingRecipeId[])
    .filter((id) => PROCESSING_RECIPES[id].building === building.kind)
    .map((recipeId) => {
      const recipe = PROCESSING_RECIPES[recipeId];
      const title = recipe.inputs
        .map((line) => `${TRAY_LABELS[line.item]}${line.amount}`)
        .join('+');
      const result = recipe.outputs
        .map((line) => `${TRAY_LABELS[line.item]}${line.amount}`)
        .join('+');
      return button(session, handlers, `${title} → ${result}`, {
        type: 'startProcessing',
        buildingId: building.id,
        recipeId,
      });
    });
}
/** Manual dispatch deliberately exposes one destination and a bounded cargo amount before sending. */
export function transportActions(
  session: GameSession,
  building: Building,
  ui: UiState,
  handlers: UiHandlers,
): Action[] | null {
  if (building.kind !== 'transportWarehouse') return null;
  const targets = session.state.buildings.filter((b) => b.kind === 'shop' || b.kind === 'dock');
  const target = targets.find((b) => b.id === ui.transportTargetId) ?? targets[0];
  const quantity = tradeQuantity(
    session.state,
    building.id,
    ui.tradeItem,
    ui.quantity,
    'inventory',
  );
  return [
    { text: `货物：${TRAY_LABELS[ui.tradeItem]}`, run: handlers.item },
    { text: `数量：${ui.quantity === 'all' ? '全部' : ui.quantity} ↻`, run: handlers.quantity },
    {
      text: target
        ? `目的地：${CONFIG.buildings[target.kind].label} ${target.id}`
        : '暂无商店或码头',
      enabled: !!target,
      run: () => handlers.transportTarget?.(),
    },
    target
      ? button(
          session,
          handlers,
          target.kind === 'shop' ? `出售 ${quantity}份` : `装货 ${quantity}份`,
          {
            type: 'transportDeliver',
            buildingId: building.id,
            targetId: target.id,
            cargo: [{ item: ui.tradeItem, quantity }],
          },
        )
      : { text: '需要商店或码头', enabled: false, run: () => {} },
  ];
}

export function cycleTransportTarget(session: GameSession, ui: UiState, refresh: () => void): void {
  ui.transportTargetId = nextTransportTarget(session.state, ui.transportTargetId);
  refresh();
}
