import type { GameState, Command, Item } from '../types';
import { CONFIG, MAX_TIME } from '../config';
import { requireRule } from '../guards';
import { find, nextId, getCapacity, getUsedStorage } from '../state';
export function start(
  s: GameState,
  command: Extract<Command, { type: 'start' }>,
  effectiveNow: number,
): string[] {
  const events: string[] = [];
  const b = find(s, command.buildingId);
  requireRule(!b.job, '已有生产任务，请先领取');
  requireRule(b.kind === 'farm' || b.kind === 'coldWarehouse', '此建筑不能生产');
  const duration = b.kind === 'farm' ? CONFIG.cropDurationMs : CONFIG.coldDurationMs;
  if (b.kind === 'coldWarehouse') {
    requireRule(s.inventory.vegetable >= CONFIG.coldInput, '蔬菜不足');
    s.inventory.vegetable -= CONFIG.coldInput;
  }
  requireRule(effectiveNow + duration <= MAX_TIME, '时间超出范围');
  b.job = { id: nextId(s, 'j'), startedAt: effectiveNow, readyAt: effectiveNow + duration };
  events.push(b.kind === 'farm' ? '已开始种植' : '已开始冷藏处理');
  return events;
}

export function collect(
  s: GameState,
  command: Extract<Command, { type: 'collect' }>,
  effectiveNow: number,
): string[] {
  const events: string[] = [];
  const b = find(s, command.buildingId),
    job = b.job;
  requireRule(job, '没有可领取的任务');
  requireRule(effectiveNow >= job.readyAt, '生产尚未完成');
  const item: Item = b.kind === 'farm' ? 'vegetable' : 'chilledVegetable';
  const amount = b.kind === 'farm' ? CONFIG.cropYield : CONFIG.coldInput;
  requireRule(getUsedStorage(s) + amount <= getCapacity(s), '仓库已满，请交付订单或扩建');
  s.inventory[item] += amount;
  delete b.job;
  events.push(`领取了 ${amount} 份${item === 'vegetable' ? '蔬菜' : '冷藏蔬菜'}`);
  return events;
}
