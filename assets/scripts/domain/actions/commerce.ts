import type { GameState, Command, Item, LandCell, DropSnapshot } from '../types';
import { requireDropSnapshot } from '../drop-move';
import { ITEM_KEYS, isCrop, MAX_CROP_DURATION } from '../crops';
import { isDockShore } from '../island';
import { hasDockExit } from '../merge-plan';
import { worldSize } from '../world';
import { MAX_TIME, MAX_VALUE } from '../config';
import {
  COMMERCE,
  emptyStock,
  stockTotal,
  shippingReward,
  isTradableItem,
  isGroundTradeItem,
  shippingPriceSnapshot,
} from '../commerce';
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
/** A dragged crop pile is transferred whole, without a temporary warehouse deposit. */
function groundCargo(s: GameState, source: LandCell, item: Item, amount: number) {
  requireRule(
    source &&
      integer(source.x, worldSize(s.terrainVersion) - 1) &&
      integer(source.z, worldSize(s.terrainVersion) - 1),
    '地面货物位置无效',
  );
  requireRule(isGroundTradeItem(item), '仅支持拖入地面农产品堆');
  const pile = s.groundStacks.find((p) => p.x === source.x && p.z === source.z);
  requireRule(pile && pile.item === item && pile.amount === amount, '地面作物堆已变化，请重新拖动');
  return pile;
}
/** Validate the entire explicit source before crediting or reserving cargo space. */
function consumeGroundCargo(
  s: GameState,
  source: LandCell | { type: 'drop'; drop: DropSnapshot },
  item: Item,
  amount: number,
): () => void {
  requireRule(source && typeof source === 'object', '地面货物来源无效');
  if ('type' in source) {
    requireRule(source.type === 'drop', '地面货物来源无效');
    requireRule(isGroundTradeItem(item), '仅支持拖入地面农产品堆');
    const drop = requireDropSnapshot(s, source.drop);
    requireRule(drop.item === item && drop.amount === amount, '掉落物已变化，请重新拖动');
    return () => {
      s.looseDrops = s.looseDrops.filter((d) => d !== drop);
    };
  }
  const pile = groundCargo(s, source, item, amount);
  return () => {
    s.groundStacks = s.groundStacks.filter((p) => p !== pile);
  };
}
export function shopTrade(s: GameState, c: Extract<Command, { type: 'shopTrade' }>): string[] {
  requireRule(find(s, c.buildingId).kind === 'shop', '请选择商店');
  quantity(c.item, c.quantity);
  requireRule(
    isTradableItem(c.item),
    c.item === 'mud' ? '泥土暂不能用于交易' : '树种暂不能用于交易',
  );
  requireRule(c.side === 'buy' || c.side === 'sell', '买卖方向无效');
  requireRule(c.source === undefined || c.side === 'sell', '地面作物仅可出售');
  const consume =
    c.source !== undefined ? consumeGroundCargo(s, c.source, c.item, c.quantity) : null;
  const stock = s.commerce.shopStock[c.buildingId];
  requireRule(stock, '商店库存不存在');
  const price = COMMERCE.prices[c.item][c.side] * c.quantity;
  if (c.side === 'buy') {
    requireRule(
      isCrop(c.item),
      c.item === 'chilledVegetable'
        ? '冷藏货物仅用于清理旧库存，不再出售新货'
        : '此货物仅可售出，商店不出售新货',
    );
    requireRule(stock[c.item] >= c.quantity, '商店存货不足');
    requireRule(getUsedStorage(s) + c.quantity <= getCapacity(s), '仓库空间不足');
    spend(s, price);
    stock[c.item] -= c.quantity;
    s.inventory[c.item] += c.quantity;
  } else {
    requireRule(consume || s.inventory[c.item] >= c.quantity, '仓库货物不足');
    credit(s, price);
    if (consume) consume();
    else s.inventory[c.item] -= c.quantity;
  }
  return [c.side === 'buy' ? '购买完成' : '出售完成'];
}
export function orderFulfill(
  s: GameState,
  c: Extract<Command, { type: 'orderFulfill' }>,
): string[] {
  requireRule(find(s, c.buildingId).kind === 'orderBoard', '请选择订单板');
  quantity(c.orderId, 1);
  requireRule(
    isTradableItem(c.orderId),
    c.orderId === 'mud' ? '泥土暂不能用于交易' : '树种暂不能用于交易',
  );
  requireRule(integer(c.offerId) && c.offerId === s.commerce.offerId, '订单已更新');
  requireRule(s.commerce.offerId < MAX_VALUE && s.completedOrders < MAX_VALUE, '订单达到上限');
  requireRule(
    c.orderId !== 'wood' && c.orderId !== 'stone' && c.orderId !== 'soil',
    '此产品暂无大宗订单',
  );
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
  requireRule(
    isTradableItem(c.item),
    c.item === 'mud' ? '泥土暂不能用于交易' : '树种暂不能用于交易',
  );
  requireRule(c.direction === 'stage' || c.direction === 'return', '转运方向无效');
  requireRule(c.source === undefined || c.direction === 'stage', '地面作物仅可备货');
  const consume =
    c.source !== undefined ? consumeGroundCargo(s, c.source, c.item, c.quantity) : null;
  const cargo = s.commerce.dockCargo[c.buildingId];
  requireRule(cargo, '船坞货区不存在');
  if (c.direction === 'stage') {
    requireRule(consume || s.inventory[c.item] >= c.quantity, '仓库货物不足');
    requireRule(stockTotal(cargo) + c.quantity <= COMMERCE.dockCapacity, '船坞货区已满');
    if (consume) consume();
    else s.inventory[c.item] -= c.quantity;
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
  const dock = find(s, c.buildingId);
  requireRule(dock.kind === 'dock', '请选择船坞');
  // Legacy saves remain readable, but only a sea-facing dock can start a new voyage.
  // Cargo returns and receipts from earlier voyages deliberately have no shore gate.
  requireRule(
    dock.dockStyle === 'simple'
      ? hasDockExit(s, dock)
      : isDockShore(dock, s.mapSeed, s.terrainVersion, s.landExtensions),
    '船坞出口必须朝向海面，请长按搬到临水海岸后发船',
  );
  requireRule(integer(c.shipmentId) && c.shipmentId === s.commerce.shipmentId, '发货单已更新');
  requireRule(s.commerce.shipmentId < MAX_VALUE, '发货编号达到上限');
  requireRule(!s.commerce.shipments[c.buildingId], '请先结算上一船货物');
  const cargo = s.commerce.dockCargo[c.buildingId];
  requireRule(cargo && stockTotal(cargo) > 0, '请先备货');
  requireRule(cargo.sapling === 0, '树苗暂不能用于交易');
  requireRule(cargo.treeSeed === 0, '树种暂不能用于交易');
  requireRule(cargo.mud === 0, '泥土暂不能用于交易');
  requireRule(
    integer(COMMERCE.shippingDurationMs, MAX_CROP_DURATION) && COMMERCE.shippingDurationMs > 0,
    '运输时长配置无效',
  );
  requireRule(now + COMMERCE.shippingDurationMs <= MAX_TIME, '时间达到上限');
  const unitPrices = shippingPriceSnapshot();
  requireRule(
    ITEM_KEYS.every(
      (item) => integer(unitPrices[item]) && (cargo[item] === 0 || unitPrices[item] > 0),
    ),
    '运价配置无效',
  );
  const reward = shippingReward(cargo, unitPrices);
  requireRule(integer(reward) && reward > 0, '运输货款超出范围');
  s.commerce.shipments[c.buildingId] = {
    id: s.commerce.shipmentId++,
    cargo: { ...cargo },
    durationMs: COMMERCE.shippingDurationMs,
    unitPrices,
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
