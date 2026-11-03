import type { GameState, Command, Item } from '../types';
import { ITEM_KEYS } from '../crops';
import { MAX_TIME, MAX_VALUE } from '../config';
import { COMMERCE, emptyStock, stockTotal, shippingReward } from '../commerce';
import { integer, requireRule } from '../guards';
import { find, getCapacity, getUsedStorage, spend } from '../state';
function quantity(item: Item, amount: number): void {
  requireRule(ITEM_KEYS.includes(item), '货物不存在');
  requireRule(integer(amount) && amount > 0, '数量必须为正整数');
}
function credit(s: GameState, reward: number): void {
  requireRule(integer(s.coins + reward), '金币达到上限');
  s.coins += reward;
}
export function shopTrade(s: GameState, c: Extract<Command, { type: 'shopTrade' }>): string[] {
  requireRule(find(s, c.buildingId).kind === 'shop', '请选择商店');
  quantity(c.item, c.quantity);
  requireRule(c.side === 'buy' || c.side === 'sell', '买卖方向无效');
  const stock = s.commerce.shopStock[c.buildingId];
  requireRule(stock, '商店库存不存在');
  const price = COMMERCE.prices[c.item][c.side] * c.quantity;
  if (c.side === 'buy') {
    requireRule(
      c.item !== 'chilledVegetable' && c.item !== 'wood' && c.item !== 'stone',
      '冷藏货物仅用于清理旧库存，不再出售新货',
    );
    requireRule(stock[c.item] >= c.quantity, '商店存货不足');
    requireRule(getUsedStorage(s) + c.quantity <= getCapacity(s), '仓库空间不足');
    spend(s, price);
    stock[c.item] -= c.quantity;
    s.inventory[c.item] += c.quantity;
  } else {
    requireRule(s.inventory[c.item] >= c.quantity, '仓库货物不足');
    credit(s, price);
    s.inventory[c.item] -= c.quantity;
  }
  return [c.side === 'buy' ? '购买完成' : '出售完成'];
}
export function orderFulfill(
  s: GameState,
  c: Extract<Command, { type: 'orderFulfill' }>,
): string[] {
  requireRule(find(s, c.buildingId).kind === 'orderBoard', '请选择订单板');
  quantity(c.orderId, 1);
  requireRule(integer(c.offerId) && c.offerId === s.commerce.offerId, '订单已更新');
  requireRule(s.commerce.offerId < MAX_VALUE && s.completedOrders < MAX_VALUE, '订单达到上限');
  requireRule(c.orderId !== 'wood' && c.orderId !== 'stone', '此产品暂无大宗订单');
  const order = COMMERCE.orders[c.orderId];
  requireRule(s.inventory[c.orderId] >= order.amount, '订单货物不足');
  credit(s, order.reward);
  s.inventory[c.orderId] -= order.amount;
  s.completedOrders++;
  s.commerce.offerId++;
  return ['大宗订单已交付'];
}
export function dockTransfer(
  s: GameState,
  c: Extract<Command, { type: 'dockTransfer' }>,
): string[] {
  requireRule(find(s, c.buildingId).kind === 'dock', '请选择船坞');
  quantity(c.item, c.quantity);
  requireRule(c.direction === 'stage' || c.direction === 'return', '转运方向无效');
  const cargo = s.commerce.dockCargo[c.buildingId];
  requireRule(cargo, '船坞货区不存在');
  if (c.direction === 'stage') {
    requireRule(s.inventory[c.item] >= c.quantity, '仓库货物不足');
    requireRule(stockTotal(cargo) + c.quantity <= COMMERCE.dockCapacity, '船坞货区已满');
    s.inventory[c.item] -= c.quantity;
    cargo[c.item] += c.quantity;
  } else {
    requireRule(cargo[c.item] >= c.quantity, '待发货物不足');
    requireRule(getUsedStorage(s) + c.quantity <= getCapacity(s), '仓库空间不足');
    cargo[c.item] -= c.quantity;
    s.inventory[c.item] += c.quantity;
  }
  return [c.direction === 'stage' ? '货物已备货' : '货物已退回仓库'];
}
export function dockShip(
  s: GameState,
  c: Extract<Command, { type: 'dockShip' }>,
  now: number,
): string[] {
  requireRule(find(s, c.buildingId).kind === 'dock', '请选择船坞');
  requireRule(integer(c.shipmentId) && c.shipmentId === s.commerce.shipmentId, '发货单已更新');
  requireRule(s.commerce.shipmentId < MAX_VALUE, '发货编号达到上限');
  requireRule(!s.commerce.shipments[c.buildingId], '请先结算上一船货物');
  const cargo = s.commerce.dockCargo[c.buildingId];
  requireRule(cargo && stockTotal(cargo) > 0, '请先备货');
  requireRule(now + COMMERCE.shippingDurationMs <= MAX_TIME, '时间达到上限');
  const reward = shippingReward(cargo);
  s.commerce.shipments[c.buildingId] = {
    id: s.commerce.shipmentId++,
    cargo: { ...cargo },
    reward,
    startedAt: now,
    completeAt: now + COMMERCE.shippingDurationMs,
  };
  s.commerce.dockCargo[c.buildingId] = emptyStock();
  return ['船只已出发'];
}
export function dockCollect(
  s: GameState,
  c: Extract<Command, { type: 'dockCollect' }>,
  now: number,
): string[] {
  requireRule(find(s, c.buildingId).kind === 'dock', '请选择船坞');
  const shipment = s.commerce.shipments[c.buildingId];
  requireRule(
    shipment && integer(c.shipmentId) && shipment.id === c.shipmentId,
    '发货单不存在或已结算',
  );
  requireRule(now >= shipment.completeAt, '货物运输中');
  credit(s, shipment.reward);
  delete s.commerce.shipments[c.buildingId];
  return ['物流货款已结算'];
}
