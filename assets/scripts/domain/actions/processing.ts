import type { Command, GameState } from '../types';
import { MAX_TIME } from '../config';
import { processingRecipe, validateProcessingRecipe } from '../processing';
import { find, nextId, getUsedStorage, getCapacity } from '../state';
import { integer, requireRule } from '../guards';

/** Only this explicit command draws from inventory; attached materials are never hidden fuel. */
export function startProcessing(
  s: GameState,
  c: Extract<Command, { type: 'startProcessing' }>,
  now: number,
): string[] {
  const building = find(s, c.buildingId),
    recipe = processingRecipe(c.recipeId);
  requireRule(building.kind === recipe.building, '此建筑不能使用该加工配方');
  requireRule(!building.processingJob && !building.job, '请先领取上一批加工成品');
  validateProcessingRecipe(recipe);
  requireRule(now + recipe.durationMs <= MAX_TIME, '时间超出范围');
  for (const input of recipe.inputs)
    requireRule(s.inventory[input.item] >= input.amount, '加工原料不足');
  const id = nextId(s, 'j');
  for (const input of recipe.inputs) s.inventory[input.item] -= input.amount;
  building.processingJob = {
    id,
    recipeId: c.recipeId,
    startedAt: now,
    readyAt: now + recipe.durationMs,
    durationMs: recipe.durationMs,
    inputs: recipe.inputs.map((e) => ({ ...e })),
    outputs: recipe.outputs.map((e) => ({ ...e })),
  };
  return ['已投入原料开始加工'];
}
export function collectProcessing(
  s: GameState,
  c: Extract<Command, { type: 'collectProcessing' }>,
  now: number,
): string[] {
  const building = find(s, c.buildingId),
    job = building.processingJob;
  requireRule(job && job.id === c.jobId, '加工任务不存在或已领取');
  requireRule(now >= job.readyAt, '加工尚未完成');
  const amount = job.outputs.reduce((n, e) => n + e.amount, 0);
  requireRule(getUsedStorage(s) + amount <= getCapacity(s), '仓库空间不足，成品保留在建筑中');
  for (const output of job.outputs)
    requireRule(integer(s.inventory[output.item] + output.amount), '成品库存达到上限');
  for (const output of job.outputs) s.inventory[output.item] += output.amount;
  delete building.processingJob;
  return ['已领取加工成品'];
}
