import type { BuildingKind, ProcessingJob } from './types';
import { MAX_TIME } from './config';
import { MAX_CROP_DURATION } from './crops';
import { processingRecipe, validateProcessingAmounts } from './processing';
import { integer, requireRule } from './guards';
export function parseProcessingJob(
  raw: unknown,
  kind: BuildingKind,
  savedTime: number,
  acceptId: (id: unknown, prefix: string) => string,
): ProcessingJob {
  requireRule(raw !== null && typeof raw === 'object' && !Array.isArray(raw), '加工任务无效');
  const value = raw as Record<string, unknown>;
  requireRule(
    Object.keys(value).every((key) =>
      ['id', 'recipeId', 'startedAt', 'readyAt', 'durationMs', 'inputs', 'outputs'].includes(key),
    ),
    '加工任务含未知字段',
  );
  const recipe = processingRecipe(value.recipeId);
  requireRule(recipe.building === kind, '此建筑不应有此加工任务');
  requireRule(
    integer(value.startedAt, MAX_TIME) &&
      integer(value.readyAt, MAX_TIME) &&
      integer(value.durationMs, MAX_CROP_DURATION) &&
      value.durationMs > 0 &&
      value.startedAt <= savedTime &&
      value.readyAt - value.startedAt === value.durationMs,
    '加工任务时间无效',
  );
  // Snapshots retain promised quantities across later balancing; kinds and bounds remain strict.
  validateProcessingAmounts(value.inputs as ProcessingJob['inputs'], recipe.inputs);
  validateProcessingAmounts(value.outputs as ProcessingJob['outputs'], recipe.outputs);
  requireRule(value.crop === undefined && value.yield === undefined, '加工任务混入其他生产状态');
  return {
    id: acceptId(value.id, 'j'),
    recipeId: value.recipeId as ProcessingJob['recipeId'],
    startedAt: value.startedAt,
    readyAt: value.readyAt,
    durationMs: value.durationMs,
    inputs: (value.inputs as ProcessingJob['inputs']).map((e) => ({
      item: e.item,
      amount: e.amount,
    })),
    outputs: (value.outputs as ProcessingJob['outputs']).map((e) => ({
      item: e.item,
      amount: e.amount,
    })),
  };
}
