import type { GameState, DropSnapshot, GroundStack, LooseDrop, Command } from './types';
import { assertGroundCell } from './ground-placement';
import { preserveTradeTile } from './geometry';
import { stackLimitFor } from './foundation';
import { requireRule } from './guards';
import { ITEM_KEYS } from './crops';
import { validItemAmount } from './v6-material-amount';
export interface DropMovePlan {
  transferAmount: number;
  remaining: number;
  reason: string | null;
}
export function requireDropSnapshot(state: GameState, snapshot: DropSnapshot): LooseDrop {
  requireRule(snapshot && typeof snapshot === 'object', '掉落物快照无效');
  const current = state.looseDrops.find((d) => d.id === snapshot.id);
  requireRule(
    current &&
      current.item === snapshot.item &&
      current.amount === snapshot.amount &&
      current.x6 === snapshot.x6 &&
      current.z6 === snapshot.z6,
    '掉落物已变化，请重新选择',
  );
  return current;
}
export function requireStackSnapshot(state: GameState, snapshot: GroundStack): GroundStack {
  requireRule(snapshot && typeof snapshot === 'object', '地堆快照无效');
  const current = state.groundStacks.find((p) => p.x === snapshot.x && p.z === snapshot.z);
  requireRule(
    current && current.item === snapshot.item && current.amount === snapshot.amount,
    '地堆已变化，请重新选择',
  );
  return current;
}
function transfer(
  source: { item: LooseDrop['item']; amount: number },
  target?: { item: LooseDrop['item']; amount: number },
): number {
  requireRule(!target || target.item === source.item, '只能合并相同物品');
  const amount = Math.min(source.amount, stackLimitFor(source.item) - (target?.amount ?? 0));
  requireRule(amount > 0, '目标堆已满，物品保留原处');
  return amount;
}
export function dropMovePlan(
  state: GameState,
  command: Extract<Command, { type: 'moveDrop' }>,
): DropMovePlan {
  const { source, target } = command;
  try {
    const actual = requireDropSnapshot(state, source);
    requireRule(target && typeof target === 'object', '请选择掉落物的新位置');
    if (target.type === 'drop') {
      const other = requireDropSnapshot(state, target.drop);
      requireRule(other.id !== actual.id, '物品已经在原处');
      const transferAmount = transfer(actual, other);
      return { transferAmount, remaining: actual.amount - transferAmount, reason: null };
    }
    requireRule(target.type === 'ground', '移动目标无效');
    assertGroundCell(state, target.x, target.z, actual.id);
    const other = state.groundStacks.find((p) => p.x === target.x && p.z === target.z);
    if (target.stack === undefined) requireRule(!other, '目标地堆已变化，请重新选择');
    else
      requireRule(
        target.stack.x === target.x &&
          target.stack.z === target.z &&
          requireStackSnapshot(state, target.stack) === other,
        '目标地堆已变化，请重新选择',
      );
    const transferAmount = transfer(actual, other),
      remaining = actual.amount - transferAmount;
    const groundStacks = state.groundStacks
      .filter((p) => p !== other)
      .concat({
        x: target.x,
        z: target.z,
        item: actual.item,
        amount: (other?.amount ?? 0) + transferAmount,
      });
    const looseDrops = state.looseDrops
      .filter((d) => d !== actual)
      .concat(remaining ? [{ ...actual, amount: remaining }] : []);
    preserveTradeTile({ ...state, groundStacks, looseDrops });
    return { transferAmount, remaining, reason: null };
  } catch (error) {
    return {
      transferAmount: 0,
      remaining: source?.amount ?? 0,
      reason: error instanceof Error ? error.message : '物品无法移动',
    };
  }
}
export function stackIntoDropPlan(
  state: GameState,
  command: Extract<Command, { type: 'mergeStackIntoDrop' }>,
): DropMovePlan {
  const { source, target } = command;
  try {
    const actual = requireStackSnapshot(state, source),
      other = requireDropSnapshot(state, target);
    const transferAmount = transfer(actual, other);
    return { transferAmount, remaining: actual.amount - transferAmount, reason: null };
  } catch (error) {
    return {
      transferAmount: 0,
      remaining: source?.amount ?? 0,
      reason: error instanceof Error ? error.message : '物品无法合并',
    };
  }
}
/** A sidebar drag contributes at most one unit, retaining fractional material precision. */
export function stockIntoDropPlan(
  state: GameState,
  command: Extract<Command, { type: 'mergeStockIntoDrop' }>,
): DropMovePlan {
  const { source, target } = command;
  try {
    requireRule(
      source &&
        ITEM_KEYS.includes(source.item) &&
        validItemAmount(source.amount, source.item, state.terrainVersion) &&
        source.amount > 0 &&
        state.inventory[source.item] === source.amount,
      '库存物品已变化或数量不足，请重新拖动',
    );
    const other = requireDropSnapshot(state, target);
    const transferAmount = transfer({ ...source, amount: Math.min(1, source.amount) }, other);
    return { transferAmount, remaining: source.amount - transferAmount, reason: null };
  } catch (error) {
    return {
      transferAmount: 0,
      remaining: source?.amount ?? 0,
      reason: error instanceof Error ? error.message : '物品无法合并',
    };
  }
}
