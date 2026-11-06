import type { Item, ItemAmount, Stock, CompostState } from './types';
export type { CompostJob, CompostState } from './types';
import { MAX_TIME } from './config';
import { ITEM_KEYS, MAX_CROP_DURATION, MAX_CROP_YIELD } from './crops';
import { integer, requireRule, time } from './guards';

export type CompostItem = 'vegetable' | 'wheat' | 'lettuce' | 'rice' | 'treeSeed';
export const COMPOST_ITEMS: readonly CompostItem[] = [
  'vegetable',
  'wheat',
  'lettuce',
  'rice',
  'treeSeed',
];
export const MAX_COMPOST_CAPACITY = MAX_CROP_YIELD;
/** Temporary balance, not player commitments. Each new barrel/job snapshots its promise. */
export const COMPOST_BALANCE = {
  capacity: 16,
  inputAmount: 2,
  durationMs: 15_000,
  fertilizerYield: 1,
};
export function isCompostItem(item: unknown): item is CompostItem {
  return typeof item === 'string' && COMPOST_ITEMS.includes(item as CompostItem);
}
function exactRecord(
  raw: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  requireRule(raw !== null && typeof raw === 'object' && !Array.isArray(raw), '堆肥结构无效');
  const prototype: unknown = Object.getPrototypeOf(raw);
  requireRule(prototype === Object.prototype || prototype === null, '堆肥结构无效');
  const keys = Reflect.ownKeys(raw);
  requireRule(
    required.every((key) => keys.includes(key)) &&
      keys.every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(raw, key);
        return (
          typeof key === 'string' &&
          (required.includes(key) || optional.includes(key)) &&
          descriptor &&
          'value' in descriptor
        );
      }),
    '堆肥含未知或缺失字段',
  );
  return raw as Record<string, unknown>;
}
function validateJobId(id: unknown): asserts id is string {
  requireRule(typeof id === 'string' && /^j[1-9][0-9]{0,8}$/.test(id), '堆肥任务编号无效');
}
function validateInputs(raw: unknown): number {
  requireRule(
    Array.isArray(raw) && raw.length > 0 && raw.length <= COMPOST_ITEMS.length,
    '堆肥材料记录无效',
  );
  const keys = Reflect.ownKeys(raw);
  requireRule(
    Object.getPrototypeOf(raw) === Array.prototype &&
      keys.length === raw.length + 1 &&
      keys.every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(raw, key);
        return (
          typeof key === 'string' &&
          (key === 'length' ||
            Array.from({ length: raw.length }, (_, i) => `${i}`).includes(key)) &&
          descriptor &&
          'value' in descriptor
        );
      }),
    '堆肥材料记录无效',
  );
  let total = 0;
  const seen = new Set<Item>();
  for (const entry of raw) {
    const value = exactRecord(entry, ['item', 'amount']);
    requireRule(isCompostItem(value.item) && !seen.has(value.item), '堆肥材料种类无效');
    requireRule(integer(value.amount, MAX_CROP_YIELD) && value.amount > 0, '堆肥材料数量无效');
    requireRule(value.amount <= MAX_CROP_YIELD - total, '堆肥材料总量无效');
    total += value.amount;
    seen.add(value.item);
  }
  return total;
}
/** Strict for commands and untrusted saves. Never repair a malformed asset record. */
export function validateCompostState(
  raw: unknown,
  savedTime = MAX_TIME,
): asserts raw is CompostState {
  time(savedTime);
  const value = exactRecord(raw, ['capacity', 'stock'], ['job']);
  requireRule(integer(value.capacity, MAX_COMPOST_CAPACITY) && value.capacity > 0, '木桶容量无效');
  const stock = exactRecord(value.stock, ITEM_KEYS);
  let occupied = 0;
  for (const item of ITEM_KEYS) {
    const amount = stock[item];
    requireRule(integer(amount) && (isCompostItem(item) || amount === 0), '木桶材料库存无效');
    requireRule(amount <= value.capacity - occupied, '木桶材料超出容量');
    occupied += amount;
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'job')) return;
  const job = exactRecord(value.job, [
    'id',
    'startedAt',
    'readyAt',
    'durationMs',
    'inputs',
    'fertilizerYield',
  ]);
  validateJobId(job.id);
  requireRule(
    integer(job.startedAt, MAX_TIME) &&
      integer(job.readyAt, MAX_TIME) &&
      integer(job.durationMs, MAX_CROP_DURATION) &&
      job.durationMs > 0 &&
      job.startedAt <= savedTime &&
      job.readyAt - job.startedAt === job.durationMs,
    '堆肥任务时间无效',
  );
  requireRule(
    integer(job.fertilizerYield, MAX_CROP_YIELD) && job.fertilizerYield > 0,
    '堆肥产量无效',
  );
  requireRule(validateInputs(job.inputs) <= value.capacity - occupied, '木桶材料超出容量');
}
export function cloneCompostState(state: CompostState): CompostState {
  validateCompostState(state);
  return {
    capacity: state.capacity,
    stock: Object.fromEntries(ITEM_KEYS.map((item) => [item, state.stock[item]])) as Stock,
    ...(state.job
      ? {
          job: {
            id: state.job.id,
            startedAt: state.job.startedAt,
            readyAt: state.job.readyAt,
            durationMs: state.job.durationMs,
            inputs: state.job.inputs.map((e) => ({ item: e.item, amount: e.amount })),
            fertilizerYield: state.job.fertilizerYield,
          },
        }
      : {}),
  };
}
export function createCompostState(capacity = COMPOST_BALANCE.capacity): CompostState {
  const state = {
    capacity,
    stock: Object.fromEntries(ITEM_KEYS.map((item) => [item, 0])) as Stock,
  };
  validateCompostState(state);
  return state;
}
export function compostOccupied(state: CompostState): number {
  validateCompostState(state);
  return (
    ITEM_KEYS.reduce((sum, item) => sum + state.stock[item], 0) +
    (state.job?.inputs.reduce((sum, input) => sum + input.amount, 0) ?? 0)
  );
}
export function compostFreeSpace(state: CompostState): number {
  const occupied = compostOccupied(state);
  return state.capacity - occupied;
}
export function compostStage(state: CompostState, now: number): 'idle' | 'working' | 'ready' {
  time(now);
  validateCompostState(state, now);
  return !state.job ? 'idle' : now >= state.job.readyAt ? 'ready' : 'working';
}
function validateBalance(): void {
  requireRule(
    integer(COMPOST_BALANCE.inputAmount, MAX_CROP_YIELD) &&
      COMPOST_BALANCE.inputAmount > 0 &&
      integer(COMPOST_BALANCE.durationMs, MAX_CROP_DURATION) &&
      COMPOST_BALANCE.durationMs > 0 &&
      integer(COMPOST_BALANCE.fertilizerYield, MAX_CROP_YIELD) &&
      COMPOST_BALANCE.fertilizerYield > 0,
    '堆肥配置无效',
  );
}
/** Start at most one batch at now; no offline catch-up loop. Only a real start needs an ID. */
export function compostStartPlan(state: CompostState, now: number, jobId?: string): CompostState {
  time(now);
  validateCompostState(state, now);
  const next = cloneCompostState(state);
  if (next.job) return next;
  validateBalance();
  if (compostOccupied(next) < COMPOST_BALANCE.inputAmount) return next;
  validateJobId(jobId);
  requireRule(COMPOST_BALANCE.durationMs <= MAX_TIME - now, '时间超出范围');
  let remaining = COMPOST_BALANCE.inputAmount;
  const inputs: ItemAmount[] = [];
  for (const item of COMPOST_ITEMS) {
    const amount = Math.min(remaining, next.stock[item]);
    if (amount === 0) continue;
    next.stock[item] -= amount;
    inputs.push({ item, amount });
    remaining -= amount;
  }
  next.job = {
    id: jobId,
    startedAt: now,
    readyAt: now + COMPOST_BALANCE.durationMs,
    durationMs: COMPOST_BALANCE.durationMs,
    inputs,
    fertilizerYield: COMPOST_BALANCE.fertilizerYield,
  };
  return next;
}
/** Full deposit or failure. The caller commits its exact source deduction only after success. */
export function compostInputPlan(
  state: CompostState,
  item: Item,
  amount: number,
  now: number,
  jobId?: string,
): CompostState {
  time(now);
  validateCompostState(state, now);
  requireRule(isCompostItem(item), '此材料不能堆肥');
  requireRule(integer(amount) && amount > 0, '堆肥投入数量无效');
  requireRule(amount <= compostFreeSpace(state), '木桶空间不足');
  const next = cloneCompostState(state);
  next.stock[item] += amount;
  return compostStartPlan(next, now, jobId);
}
/** The tool counter and barrel change together; overflow retains the original ready job. */
export function compostCollectPlan(
  state: CompostState,
  expectedJobId: string,
  now: number,
  fertilizer: number,
  nextJobId?: string,
): { compost: CompostState; fertilizer: number } {
  time(now);
  validateCompostState(state, now);
  const job = state.job;
  requireRule(job && job.id === expectedJobId, '堆肥任务不存在或已领取');
  requireRule(now >= job.readyAt, '堆肥尚未完成');
  requireRule(integer(fertilizer) && integer(fertilizer + job.fertilizerYield), '肥料达到上限');
  requireRule(nextJobId === undefined || nextJobId !== job.id, '堆肥任务编号重复');
  const next = cloneCompostState(state);
  delete next.job;
  return {
    compost: compostStartPlan(next, now, nextJobId),
    fertilizer: fertilizer + job.fertilizerYield,
  };
}
