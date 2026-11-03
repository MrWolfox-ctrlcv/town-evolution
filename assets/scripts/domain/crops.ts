import type { Crop, Item } from './types';
/** vegetable is the historical save key for carrots, not a fourth generic crop. */
export const CROP_KEYS: Crop[] = ['vegetable', 'wheat', 'lettuce'];
export const ITEM_KEYS: Item[] = [...CROP_KEYS, 'chilledVegetable', 'wood', 'stone'];
export const CROPS: Record<
  Crop,
  { label: string; durationMs: number; yield: number; buy: number }
> = {
  vegetable: { label: '胡萝卜', durationMs: 15_000, yield: 2, buy: 8 },
  wheat: { label: '小麦', durationMs: 15_000, yield: 2, buy: 8 },
  lettuce: { label: '生菜', durationMs: 15_000, yield: 2, buy: 8 },
};
export function isCrop(value: unknown): value is Crop {
  return typeof value === 'string' && CROP_KEYS.includes(value as Crop);
}
