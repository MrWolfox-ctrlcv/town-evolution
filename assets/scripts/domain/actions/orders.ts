import type { GameState, Command } from '../types';
import { MAX_VALUE, ORDERS } from '../config';
import { requireRule } from '../guards';
export function sell(
  s: GameState,
  command: Extract<Command, { type: 'sell' }>,
  _effectiveNow: number,
): string[] {
  const events: string[] = [];
  requireRule(
    command.orderId === 'vegetable' || command.orderId === 'chilledVegetable',
    '订单不存在',
  );
  const order = ORDERS[command.orderId];
  requireRule(s.inventory[command.orderId] >= order.amount, '订单货物不足');
  requireRule(s.coins + order.reward <= MAX_VALUE && s.completedOrders < MAX_VALUE, '数值达到上限');
  s.inventory[command.orderId] -= order.amount;
  s.coins += order.reward;
  s.completedOrders++;
  events.push(`订单完成，获得 ${order.reward} 金币`);
  return events;
}
