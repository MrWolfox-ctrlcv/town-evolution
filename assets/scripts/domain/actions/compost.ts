import type { Command, CompostSource, CompostState, GameState, Item } from '../types';
import { compostInputPlan, compostCollectPlan, cloneCompostState, isCompostItem } from '../compost';
import { find, nextId, getCapacity, getUsedStorage } from '../state';
import { integer, requireRule } from '../guards';

function barrel(s: GameState, id: string) {
  const b = find(s, id);
  requireRule(b.kind === 'compostBarrel' && b.compost, '请选择堆肥木桶');
  return { building: b, compost: b.compost };
}
function sourcePlan(
  s: GameState,
  source: CompostSource,
  quantity: number,
): {
  item: Item;
  consume: () => void;
} {
  requireRule(source && typeof source === 'object', '请选择明确的堆肥材料来源');
  requireRule(integer(quantity) && quantity > 0, '堆肥投入数量无效');
  if (source.type === 'inventory') {
    requireRule(
      isCompostItem(source.item) &&
        integer(source.amount) &&
        s.inventory[source.item] === source.amount &&
        quantity <= source.amount,
      '所选库存材料已变化或数量不足',
    );
    return {
      item: source.item,
      consume: () => {
        s.inventory[source.item] -= quantity;
      },
    };
  }
  if (source.type === 'ground') {
    const snapshot = source.stack;
    requireRule(snapshot && typeof snapshot === 'object', '地堆来源无效');
    const pile = s.groundStacks.find((p) => p.x === snapshot.x && p.z === snapshot.z);
    requireRule(
      pile &&
        pile.item === snapshot.item &&
        pile.amount === snapshot.amount &&
        quantity <= pile.amount,
      '所选地面材料已变化或数量不足',
    );
    requireRule(isCompostItem(pile.item), '此材料不能堆肥');
    return {
      item: pile.item,
      consume: () => {
        pile.amount -= quantity;
        if (pile.amount === 0) s.groundStacks = s.groundStacks.filter((p) => p !== pile);
      },
    };
  }
  requireRule(source.type === 'drop', '堆肥材料来源无效');
  const snapshot = source.drop;
  requireRule(snapshot && typeof snapshot === 'object', '掉落物来源无效');
  const drop = s.looseDrops.find((p) => p.id === snapshot.id);
  requireRule(
    drop &&
      drop.item === snapshot.item &&
      drop.amount === snapshot.amount &&
      drop.x6 === snapshot.x6 &&
      drop.z6 === snapshot.z6 &&
      quantity <= drop.amount,
    '所选掉落物已变化或数量不足',
  );
  requireRule(isCompostItem(drop.item), '此材料不能堆肥');
  return {
    item: drop.item,
    consume: () => {
      drop.amount -= quantity;
      if (drop.amount === 0) s.looseDrops = s.looseDrops.filter((p) => p !== drop);
    },
  };
}
function allocateStartedJob(s: GameState, before: CompostState, after: CompostState): void {
  if (after.job && after.job.id !== before.job?.id)
    requireRule(after.job.id === nextId(s, 'j'), '堆肥任务编号不一致');
}

/** Explicit sources never search nearby piles or borrow missing units from inventory. */
export function depositCompost(
  s: GameState,
  c: Extract<Command, { type: 'depositCompost' }>,
  now: number,
): string[] {
  const { building, compost } = barrel(s, c.buildingId),
    source = sourcePlan(s, c.source, c.quantity),
    next = compostInputPlan(compost, source.item, c.quantity, now, `j${s.nextId}`);
  allocateStartedJob(s, compost, next);
  source.consume();
  building.compost = next;
  return [next.job && !compost.job ? '材料已入桶，开始堆肥' : '材料已放入木桶'];
}
export function collectCompost(
  s: GameState,
  c: Extract<Command, { type: 'collectCompost' }>,
  now: number,
): string[] {
  const { building, compost } = barrel(s, c.buildingId),
    plan = compostCollectPlan(compost, c.jobId, now, s.tools.fertilizer, `j${s.nextId}`);
  allocateStartedJob(s, compost, plan.compost);
  building.compost = plan.compost;
  s.tools.fertilizer = plan.fertilizer;
  return ['已领取肥料，施肥用途尚待设计'];
}
export function withdrawCompostInput(
  s: GameState,
  c: Extract<Command, { type: 'withdrawCompostInput' }>,
): string[] {
  const { building, compost } = barrel(s, c.buildingId);
  requireRule(isCompostItem(c.item) && integer(c.quantity) && c.quantity > 0, '取回材料无效');
  requireRule(compost.stock[c.item] >= c.quantity, '只能取回尚未开始加工的材料');
  requireRule(getUsedStorage(s) + c.quantity <= getCapacity(s), '仓库空间不足，材料仍留在木桶');
  requireRule(integer(s.inventory[c.item] + c.quantity), '库存达到上限');
  const next = cloneCompostState(compost);
  next.stock[c.item] -= c.quantity;
  building.compost = next;
  s.inventory[c.item] += c.quantity;
  return ['已取回待堆肥材料'];
}
