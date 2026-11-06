import type { Crop, Item, Job } from './types';
/** vegetable is the historical save key for carrots, not a fourth generic crop. */
export const CROP_KEYS: Crop[] = ['vegetable', 'wheat', 'lettuce', 'rice'];
export const ITEM_KEYS: Item[] = [
  ...CROP_KEYS,
  'chilledVegetable',
  'wood',
  'stone',
  'soil',
  'mud',
  'treeSeed',
  'sapling',
  'milledRice',
  'flour',
  'bread',
  'roastedCarrot',
];
export const CROPS: Record<
  Crop,
  { label: string; field: 'dry' | 'water'; durationMs: number; yield: number; buy: number }
> = {
  vegetable: { label: '胡萝卜', field: 'dry', durationMs: 15_000, yield: 2, buy: 8 },
  wheat: { label: '小麦', field: 'dry', durationMs: 15_000, yield: 2, buy: 8 },
  rice: { label: '稻谷', field: 'water', durationMs: 15_000, yield: 2, buy: 8 },
  lettuce: { label: '生菜', field: 'dry', durationMs: 15_000, yield: 2, buy: 8 },
};
/** Applies to new planting/conversion only; old jobs keep their promised harvest. */
export function cropSupportsField(crop: Crop, irrigated = false): boolean {
  return CROPS[crop].field === (irrigated ? 'water' : 'dry');
}
export function isCrop(value: unknown): value is Crop {
  return typeof value === 'string' && CROP_KEYS.includes(value as Crop);
}
/** Existing jobs keep their promised output across balancing changes. */
export function cropJobYield(job: Job | null | undefined): number {
  return job?.yield ?? 2;
}
export const MAX_CROP_DURATION = 7 * 24 * 60 * 60 * 1000;
export const MAX_CROP_YIELD = 1_000_000;
