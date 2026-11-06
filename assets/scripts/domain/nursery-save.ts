import type { Job, Tree } from './types';
import { MAX_TIME } from './config';
import { MAX_CROP_DURATION, MAX_CROP_YIELD } from './crops';
import { integer, requireRule } from './guards';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Absence is the only legacy case. Partial timestamps must never turn a young tree mature. */
export function parseTreeGrowth(
  raw: Record<string, unknown>,
  savedTime: number,
): Pick<Tree, 'plantedAt' | 'readyAt' | 'growthDurationMs'> {
  if (
    raw.plantedAt === undefined &&
    raw.readyAt === undefined &&
    raw.growthDurationMs === undefined
  )
    return {};
  requireRule(
    integer(raw.plantedAt, MAX_TIME) &&
      integer(raw.readyAt, MAX_TIME) &&
      integer(raw.growthDurationMs, MAX_CROP_DURATION) &&
      raw.growthDurationMs > 0 &&
      raw.plantedAt <= savedTime &&
      raw.readyAt - raw.plantedAt === raw.growthDurationMs,
    '树木成长时间无效',
  );
  return {
    plantedAt: raw.plantedAt,
    readyAt: raw.readyAt,
    growthDurationMs: raw.growthDurationMs,
  };
}

/** The caller supplies its town-wide ID validator so nursery jobs cannot duplicate other jobs. */
export function parseNurseryJob(
  value: unknown,
  savedTime: number,
  acceptId: (id: unknown, prefix: string) => string,
): Job {
  requireRule(
    record(value) &&
      integer(value.startedAt, MAX_TIME) &&
      integer(value.readyAt, MAX_TIME) &&
      integer(value.durationMs, MAX_CROP_DURATION) &&
      value.durationMs > 0 &&
      integer(value.yield, MAX_CROP_YIELD) &&
      value.yield > 0 &&
      value.startedAt <= savedTime &&
      value.readyAt - value.startedAt === value.durationMs &&
      value.crop === undefined,
    '育苗任务无效',
  );
  return {
    id: acceptId(value.id, 'j'),
    startedAt: value.startedAt,
    readyAt: value.readyAt,
    durationMs: value.durationMs,
    yield: value.yield,
  };
}
