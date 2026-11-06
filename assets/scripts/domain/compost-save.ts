import { cloneCompostState, validateCompostState, type CompostState } from './compost';
import { requireRule, time } from './guards';

/** Barrels first appear in v10. Their own stock is always complete, even during migrations. */
export function parseCompostState(
  raw: unknown,
  savedTime: number,
  acceptId: (id: unknown, prefix: string) => string,
  sourceVersion: 8 | 9 | 10 = 10,
): CompostState {
  time(savedTime);
  requireRule([8, 9, 10].includes(sourceVersion), '堆肥存档版本无效');
  validateCompostState(raw, savedTime);
  const result = cloneCompostState(raw);
  if (result.job) result.job.id = acceptId(result.job.id, 'j');
  return result;
}
