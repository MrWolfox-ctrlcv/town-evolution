import type { Building, ItemAmount, ProcessingRecipeId } from './types';
import { ITEM_KEYS, MAX_CROP_DURATION, MAX_CROP_YIELD } from './crops';
import { integer, requireRule } from './guards';
export interface ProcessingRecipe {
  building: 'mill' | 'bakery' | 'stoneOven';
  durationMs: number;
  inputs: ItemAmount[];
  outputs: ItemAmount[];
}
/** Temporary first-play balance. Starting a job snapshots every amount and duration. */
export const PROCESSING_RECIPES: Record<ProcessingRecipeId, ProcessingRecipe> = {
  'roast-carrot': {
    building: 'stoneOven',
    durationMs: 10_000,
    inputs: [{ item: 'vegetable', amount: 2 }],
    outputs: [{ item: 'roastedCarrot', amount: 1 }],
  },
  'mill-rice': {
    building: 'mill',
    durationMs: 10_000,
    inputs: [{ item: 'rice', amount: 2 }],
    outputs: [{ item: 'milledRice', amount: 1 }],
  },
  'mill-wheat': {
    building: 'mill',
    durationMs: 10_000,
    inputs: [{ item: 'wheat', amount: 2 }],
    outputs: [{ item: 'flour', amount: 1 }],
  },
  'bake-bread': {
    building: 'bakery',
    durationMs: 15_000,
    inputs: [
      { item: 'flour', amount: 2 },
      { item: 'wood', amount: 1 },
    ],
    outputs: [{ item: 'bread', amount: 2 }],
  },
};
export function processingRecipe(id: unknown): ProcessingRecipe {
  requireRule(
    typeof id === 'string' && Object.prototype.hasOwnProperty.call(PROCESSING_RECIPES, id),
    '加工配方不存在',
  );
  return PROCESSING_RECIPES[id as ProcessingRecipeId];
}
export function validateProcessingAmounts(amounts: ItemAmount[], expected: ItemAmount[]): void {
  requireRule(Array.isArray(amounts) && amounts.length === expected.length, '加工材料记录无效');
  const seen = new Set<string>();
  for (const entry of amounts) {
    requireRule(
      entry &&
        typeof entry === 'object' &&
        ITEM_KEYS.includes(entry.item) &&
        expected.some((e) => e.item === entry.item) &&
        !seen.has(entry.item),
      '加工材料种类无效',
    );
    requireRule(integer(entry.amount, MAX_CROP_YIELD) && entry.amount > 0, '加工材料数量无效');
    seen.add(entry.item);
  }
}
export function validateProcessingRecipe(recipe: ProcessingRecipe): void {
  requireRule(
    integer(recipe.durationMs, MAX_CROP_DURATION) && recipe.durationMs > 0,
    '加工时长配置无效',
  );
  validateProcessingAmounts(recipe.inputs, recipe.inputs);
  validateProcessingAmounts(recipe.outputs, recipe.outputs);
}
export function processingStage(building: Building, now: number): 'idle' | 'working' | 'ready' {
  return !building.processingJob
    ? 'idle'
    : now >= building.processingJob.readyAt
      ? 'ready'
      : 'working';
}
