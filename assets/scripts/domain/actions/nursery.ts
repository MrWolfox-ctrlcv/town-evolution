import type { Command, GameState, Item, LandCell } from '../types';
import { MAX_TIME, MAX_VALUE } from '../config';
import { MAX_CROP_DURATION, MAX_CROP_YIELD } from '../crops';
import { useDurability } from '../foundation';
import { preserveTradeTile, validatePlacement } from '../geometry';
import { integer, requireRule } from '../guards';
import { NURSERY } from '../nursery';
import { find, getCapacity, getUsedStorage, nextId } from '../state';
import { worldSize } from '../world';

/** Sources are explicit. A ground drag spends one unit and leaves the rest in its original cell. */
function consumeOne(s: GameState, item: Item, source?: LandCell): void {
  if (source === undefined) {
    requireRule(s.inventory[item] >= 1, '库存材料不足');
    s.inventory[item]--;
    return;
  }
  requireRule(
    source &&
      integer(source.x, worldSize(s.terrainVersion) - 1) &&
      integer(source.z, worldSize(s.terrainVersion) - 1),
    '材料来源无效',
  );
  const pile = s.groundStacks.find((p) => p.x === source.x && p.z === source.z);
  requireRule(pile?.item === item && pile.amount >= 1, '地面材料不足');
  pile.amount--;
  if (pile.amount === 0) s.groundStacks = s.groundStacks.filter((p) => p !== pile);
}

/** Keep the actual crate's ID, footprint, rotation and unrelated attached materials. */
export function buildNursery(
  s: GameState,
  c: Extract<Command, { type: 'buildNursery' }>,
): string[] {
  const crate = find(s, c.buildingId);
  requireRule(crate.kind === 'crate' && !crate.job, '请把1份泥拖到箱子上');
  consumeOne(s, 'mud', c.source);
  crate.kind = 'nursery';
  validatePlacement(s, crate);
  return ['箱子与1份泥合成为育苗箱，请放入树种'];
}

export function seedNursery(s: GameState, c: Extract<Command, { type: 'seedNursery' }>): string[] {
  const nursery = find(s, c.buildingId);
  requireRule(nursery.kind === 'nursery', '请把树种拖到育苗箱');
  requireRule(!nursery.nurserySeeded && !nursery.job, '育苗箱已有树种，请先完成本轮育苗');
  consumeOne(s, 'treeSeed', c.source);
  nursery.nurserySeeded = true;
  return ['已放入1份树种，请用水壶浇水'];
}

export function waterNursery(s: GameState, buildingId: string, now: number): string[] {
  const nursery = find(s, buildingId);
  requireRule(nursery.kind === 'nursery' && nursery.nurserySeeded, '请先给育苗箱放入1份树种');
  requireRule(!nursery.job, '育苗箱已经浇水，请等待并收取树苗');
  requireRule(
    integer(NURSERY.durationMs, MAX_CROP_DURATION) &&
      NURSERY.durationMs > 0 &&
      integer(NURSERY.yield, MAX_CROP_YIELD) &&
      NURSERY.yield > 0,
    '育苗配置无效',
  );
  requireRule(now + NURSERY.durationMs <= MAX_TIME, '时间超出范围');
  useDurability(s, 'wateringCan');
  nursery.job = {
    id: nextId(s, 'j'),
    startedAt: now,
    readyAt: now + NURSERY.durationMs,
    durationMs: NURSERY.durationMs,
    yield: NURSERY.yield,
  };
  return [`育苗箱已浇水，${NURSERY.durationMs / 1000}秒后可收取树苗`];
}

export function collectNursery(s: GameState, buildingId: string, now: number): string[] {
  const nursery = find(s, buildingId);
  requireRule(nursery.kind === 'nursery' && nursery.nurserySeeded, '育苗箱中没有树苗');
  const job = nursery.job;
  requireRule(job, '请先用水壶给育苗箱浇水');
  requireRule(now >= job.readyAt, '树苗尚未培育完成');
  const amount = job.yield ?? NURSERY.yield;
  requireRule(getUsedStorage(s) + amount <= getCapacity(s), '仓库空间不足，树苗保留在育苗箱中');
  requireRule(integer(s.inventory.sapling + amount), '树苗库存达到上限');
  s.inventory.sapling += amount;
  delete nursery.job;
  delete nursery.nurserySeeded;
  return [`收取${amount}份树苗，可拖到空地种下`];
}

export function plantSapling(
  s: GameState,
  c: Extract<Command, { type: 'plantSapling' }>,
  now: number,
): string[] {
  requireRule(
    integer(c.x, worldSize(s.terrainVersion) - 1) && integer(c.z, worldSize(s.terrainVersion) - 1),
    '请选择地图内的空地',
  );
  requireRule(
    integer(NURSERY.treeDurationMs, MAX_CROP_DURATION) && NURSERY.treeDurationMs > 0,
    '树木成长配置无效',
  );
  requireRule(now + NURSERY.treeDurationMs <= MAX_TIME, '时间超出范围');
  requireRule(s.nextTreeId < MAX_VALUE, '树木编号达到上限');
  consumeOne(s, 'sapling', c.source);
  // A one-unit pile can be planted in its own cell only after the consumed pile is cleared.
  validatePlacement(s, { id: '__sapling__', kind: 'crate', x: c.x, z: c.z, rotation: 0 });
  s.trees.push({
    id: `t${s.nextTreeId++}`,
    x: c.x,
    z: c.z,
    plantedAt: now,
    readyAt: now + NURSERY.treeDurationMs,
    growthDurationMs: NURSERY.treeDurationMs,
  });
  preserveTradeTile(s);
  return [`已种下1份树苗，${NURSERY.treeDurationMs / 1000}秒后长成可砍伐的树木`];
}
