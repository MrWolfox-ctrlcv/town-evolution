import { MAX_TIME, MAX_VALUE } from './config';
export function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function integer(value: unknown, max = MAX_VALUE): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
export function time(now: number): void {
  requireRule(integer(now, MAX_TIME), '时间无效');
}
