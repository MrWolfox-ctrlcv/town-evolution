import type { Job } from '../domain/types';
export type CropStage = 'empty' | 'seedling' | 'young' | 'ready';
/** Derived from the saved job: no new save fields and no changed harvest deadline. */
export function growthStage(
  job: Pick<Job, 'startedAt' | 'readyAt'> | null | undefined,
  now: number,
): CropStage {
  if (!job) return 'empty';
  if (now >= job.readyAt) return 'ready';
  return now >= job.startedAt + (job.readyAt - job.startedAt) * 0.35 ? 'young' : 'seedling';
}
