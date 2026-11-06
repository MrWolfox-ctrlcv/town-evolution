import type { Command, GameState, Item } from '../types';
import { COMMERCE, isTradableItem, stockTotal } from '../commerce';
import { ITEM_KEYS } from '../crops';
import { integer, requireRule } from '../guards';
import { find } from '../state';

export type TransportDeliveryCommand = Extract<Command, { type: 'transportDeliver' }>;

/**
 * A manual delivery uses the town's shared inventory. Validate the entire manifest
 * before changing either side; a full dock or one missing item never sends a partial load.
 * This command neither starts a voyage nor creates persistent in-transit inventory.
 */
export function transportDeliver(s: GameState, c: TransportDeliveryCommand): string[] {
  requireRule(find(s, c.buildingId).kind === 'transportWarehouse', '请选择运输仓');
  const target = find(s, c.targetId);
  requireRule(target.kind === 'shop' || target.kind === 'dock', '请选择商店或船坞作为目的地');
  requireRule(
    Array.isArray(c.cargo) && c.cargo.length > 0 && c.cargo.length <= ITEM_KEYS.length,
    '请至少选择一种货物',
  );
  const seen = new Set<Item>();
  let total = 0;
  let reward = 0;
  for (const line of c.cargo) {
    requireRule(line && typeof line === 'object' && !Array.isArray(line), '货物清单无效');
    const { item, quantity } = line;
    requireRule(isTradableItem(item), '此货物暂不能用于交易');
    requireRule(!seen.has(item), '同一种货物只能选择一次');
    requireRule(integer(quantity) && quantity > 0, '数量必须为正整数');
    requireRule(s.inventory[item] >= quantity, '仓库货物不足，整批货物未送出');
    seen.add(item);
    total += quantity;
    if (target.kind === 'shop') {
      const price = COMMERCE.prices[item].sell;
      requireRule(integer(price) && price > 0, '商品售价配置无效');
      reward += price * quantity;
    }
  }
  requireRule(integer(total), '货物数量达到上限');
  if (target.kind === 'shop') {
    requireRule(s.commerce.shopStock[target.id], '商店库存不存在');
    requireRule(integer(reward) && integer(s.coins + reward), '金币达到上限');
  } else {
    const staged = s.commerce.dockCargo[target.id];
    requireRule(staged, '船坞货区不存在');
    requireRule(
      stockTotal(staged) + total <= COMMERCE.dockCapacity,
      '船坞货区空间不足，整批货物未送出',
    );
  }

  // All guards precede these writes, including validation of the last cargo line.
  for (const { item, quantity } of c.cargo) {
    s.inventory[item] -= quantity;
    if (target.kind === 'dock') s.commerce.dockCargo[target.id]![item] += quantity;
  }
  if (target.kind === 'shop') {
    s.coins += reward;
    return [`已向商店出售${total}份货物，获得${reward}金币`];
  }
  return [`已向船坞装入${total}份货物，尚未发船`];
}
