import { COMMERCE, CROPS, isCrop } from '../domain/game';
import { isDockShore } from '../domain/island';
import type { Command } from '../domain/game';
import type { GameSession } from '../application/GameSession';
import { tradeQuantity, tradeItems } from '../application/CommerceSelection';
import type { UiState, UiHandlers } from './UiContracts';
import type { Action } from './Widgets';
function itemLabel(item: import('../domain/game').Item): string {
  return isCrop(item)
    ? CROPS[item].label
    : item === 'wood'
      ? '木材'
      : item === 'stone'
        ? '石材'
        : '旧存冷藏菜';
}
export function commerceActions(
  session: GameSession,
  ui: UiState,
  handlers: UiHandlers,
): Action[] | null {
  const state = session.state;
  const b = state.buildings.find((item) => item.id === ui.selected);
  if (!b || !['shop', 'orderBoard', 'dock'].includes(b.kind)) return null;
  const item = ui.tradeItem,
    title = itemLabel(item);
  const button = (text: string, command: Command): Action => {
    const reason = session.reason(command);
    return {
      text,
      enabled: !reason,
      reason: reason ?? undefined,
      run: () => handlers.command(command),
    };
  };
  if (b.kind === 'orderBoard')
    return tradeItems(state)
      .filter((id): id is keyof typeof COMMERCE.orders => id in COMMERCE.orders)
      .map((orderId) => {
        const offer = COMMERCE.orders[orderId];
        return button(`${itemLabel(orderId)} ${offer.amount} → ${offer.reward}币`, {
          type: 'orderFulfill',
          buildingId: b.id,
          orderId,
          offerId: state.commerce.offerId,
        });
      });
  const quantity = (source: 'inventory' | 'shop' | 'dock') =>
    tradeQuantity(state, b.id, item, ui.quantity, source);
  const selectors: Action[] = [
    { text: `货物：${title}`, run: handlers.item },
    { text: `数量：${ui.quantity === 'all' ? '全部' : ui.quantity} ↻`, run: handlers.quantity },
  ];
  if (b.kind === 'shop')
    return [
      ...selectors,
      ...(item === 'chilledVegetable'
        ? []
        : [
            button(`买${quantity('shop')} · ${quantity('shop') * COMMERCE.prices[item].buy}币`, {
              type: 'shopTrade',
              buildingId: b.id,
              item,
              quantity: quantity('shop'),
              side: 'buy',
            }),
          ]),
      button(
        `卖${quantity('inventory')} · +${quantity('inventory') * COMMERCE.prices[item].sell}币`,
        {
          type: 'shopTrade',
          buildingId: b.id,
          item,
          quantity: quantity('inventory'),
          side: 'sell',
        },
      ),
    ];
  const shipment = state.commerce.shipments[b.id];
  return [
    ...selectors,
    button(`装货 ${quantity('inventory')}`, {
      type: 'dockTransfer',
      buildingId: b.id,
      item,
      quantity: quantity('inventory'),
      direction: 'stage',
    }),
    button(`取回 ${quantity('dock')}`, {
      type: 'dockTransfer',
      buildingId: b.id,
      item,
      quantity: quantity('dock'),
      direction: 'return',
    }),
    button(
      shipment
        ? `运输中 · ${Object.values(shipment.cargo).reduce((sum, amount) => sum + amount, 0)}份`
        : '发船 · 30秒',
      {
        type: 'dockShip',
        buildingId: b.id,
        shipmentId: state.commerce.shipmentId,
      },
    ),
    button(`领取 ${shipment?.reward ?? 0}币`, {
      type: 'dockCollect',
      buildingId: b.id,
      shipmentId: shipment?.id ?? 0,
    }),
  ];
}
export function commerceDescription(session: GameSession, ui: UiState): string | null {
  const b = session.state.buildings.find((item) => item.id === ui.selected);
  if (!b) return null;
  if (b.kind === 'shop') {
    const stock = session.state.commerce.shopStock[b.id];
    const item = ui.tradeItem;
    const title = itemLabel(item);
    return `商店 · ${title}在售${stock?.[item] ?? 0} / 库存${session.state.inventory[item]}`;
  }
  if (b.kind === 'orderBoard') return '订单板 · 批量交付';
  if (b.kind === 'dock') {
    const cargo = session.state.commerce.dockCargo[b.id],
      ship = session.state.commerce.shipments[b.id];
    const left = ship
      ? Math.max(
          0,
          Math.ceil((ship.completeAt - Math.max(Date.now(), session.state.lastSeenAt)) / 1000),
        )
      : 0;
    if (!isDockShore(b, session.state.mapSeed)) return '船坞 · 长按搬到临水海岸';
    const total = Object.values(cargo ?? {}).reduce((sum, amount) => sum + amount, 0);
    const staged = `${total}/${COMMERCE.dockCapacity}`;
    return `船坞 · 待发 ${staged}${ship ? ` · ${left ? `${left}秒` : '可领取'}` : ''}`;
  }
  return null;
}
