import type { GameState, Command } from '../types';
import { ITEM_KEYS } from '../crops';
import { MAX_VALUE, ORDERS } from '../config';
import { requireRule } from '../guards';
export function sell(
  s: GameState,
  command: Extract<Command, { type: 'sell' }>,
  _effectiveNow: number,
): string[] {
  const events: string[] = [];
  requireRule(
    s.buildings.some((b) => b.kind === 'orderBoard'),
    '请先建造订单板',
  );
  requireRule(ITEM_KEYS.includes(command.orderId), '订单不存在');
  const order = ORDERS[command.orderId];
  requireRule(order, '此产品暂无订单');
  requireRule(s.inventory[command.orderId] >= order.amount, '订单货物不足');
  requireRule(s.coins + order.reward <= MAX_VALUE && s.completedOrders < MAX_VALUE, '数值达到上限');
  s.inventory[command.orderId] -= order.amount;
  s.coins += order.reward;
  s.completedOrders++;
  events.push(`订单完成，获得 ${order.reward} 金币`);
  return events;
}
