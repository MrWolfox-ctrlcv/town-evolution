import {
  dropMovePlan,
  stackIntoDropPlan,
  stockIntoDropPlan,
  requireDropSnapshot,
  requireStackSnapshot,
} from '../drop-move';
import type { GameState, Command } from '../types';
import { requireRule } from '../guards';
import { getCapacity, getUsedStorage } from '../state';
export function pickupDrop(s: GameState, c: Extract<Command, { type: 'pickupDrop' }>): string[] {
  const drop = s.looseDrops.find((d) => d.id === c.dropId);
  requireRule(drop, '此掉落物已不在原处');
  requireRule(getUsedStorage(s) + drop.amount <= getCapacity(s), '仓库空间不足，物品仍保留地上');
  s.inventory[drop.item] += drop.amount;
  s.looseDrops = s.looseDrops.filter((d) => d !== drop);
  return ['已拾取掉落物'];
}

export function moveDrop(s: GameState, c: Extract<Command, { type: 'moveDrop' }>): string[] {
  const plan = dropMovePlan(s, c);
  requireRule(!plan.reason, plan.reason ?? '物品无法移动');
  const source = requireDropSnapshot(s, c.source);
  if (c.target.type === 'drop') requireDropSnapshot(s, c.target.drop).amount += plan.transferAmount;
  else {
    const { x, z } = c.target,
      existing = s.groundStacks.find((p) => p.x === x && p.z === z);
    if (existing) existing.amount += plan.transferAmount;
    else s.groundStacks.push({ x, z, item: source.item, amount: plan.transferAmount });
  }
  source.amount = plan.remaining;
  if (!source.amount) s.looseDrops = s.looseDrops.filter((d) => d !== source);
  return [plan.remaining ? `已叠放${plan.transferAmount}份，余量保留原处` : '已移动掉落物'];
}
export function mergeStackIntoDrop(
  s: GameState,
  c: Extract<Command, { type: 'mergeStackIntoDrop' }>,
): string[] {
  const plan = stackIntoDropPlan(s, c);
  requireRule(!plan.reason, plan.reason ?? '物品无法合并');
  const source = requireStackSnapshot(s, c.source),
    target = requireDropSnapshot(s, c.target);
  target.amount += plan.transferAmount;
  source.amount = plan.remaining;
  if (!source.amount) s.groundStacks = s.groundStacks.filter((p) => p !== source);
  return [plan.remaining ? `已叠放${plan.transferAmount}份，余量保留原处` : '已合并地面物品'];
}
export function mergeStockIntoDrop(
  s: GameState,
  c: Extract<Command, { type: 'mergeStockIntoDrop' }>,
): string[] {
  const plan = stockIntoDropPlan(s, c);
  requireRule(!plan.reason, plan.reason ?? '物品无法合并');
  requireDropSnapshot(s, c.target).amount += plan.transferAmount;
  s.inventory[c.source.item] = plan.remaining;
  return [`已叠放${plan.transferAmount}份`];
}
