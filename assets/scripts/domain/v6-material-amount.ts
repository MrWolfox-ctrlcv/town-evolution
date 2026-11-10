import { V6_MATERIAL_QUANTA } from './v6-edit-types';
import { MAX_VALUE } from './config';
/** Binary fixed-point fractions remain exactly representable through splits and merges. */
export function isV6Material(item: unknown): item is 'soil' | 'stone' {
  return item === 'soil' || item === 'stone';
}
export function materialAmount(value: unknown, limit = MAX_VALUE): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= limit &&
    Number.isSafeInteger(value * V6_MATERIAL_QUANTA)
  );
}
export function validItemAmount(
  value: unknown,
  item: unknown,
  version: number,
  limit = MAX_VALUE,
): value is number {
  return (version === 6 || version === 7) && isV6Material(item)
    ? materialAmount(value, limit)
    : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= limit;
}
/** Never render a positive fragment as zero; this terminating decimal is exact. */
export function formatV6MaterialAmount(value: number): string {
  if (!materialAmount(value)) throw Error('Invalid v6 material amount');
  return String(value);
}
