import type { BuildingKind, Item, RecipeId } from './types';
export interface ToolCraftRecipe {
  tool: 'saw' | 'hammer';
  item: Item;
  amount: number;
  kind: BuildingKind;
  recipeId: RecipeId;
}
/** User-selected tool split. Stone and cart amounts remain provisional first-play balance. */
export const TOOL_CRAFT_RECIPES: readonly ToolCraftRecipe[] = [
  { tool: 'hammer', item: 'wood', amount: 1, kind: 'orderBoard', recipeId: 'build-order-board' },
  { tool: 'hammer', item: 'wood', amount: 2, kind: 'crate', recipeId: 'build-crate' },
  { tool: 'saw', item: 'wood', amount: 1, kind: 'fence', recipeId: 'build-fence' },
  { tool: 'saw', item: 'wood', amount: 2, kind: 'bench', recipeId: 'build-bench' },
  { tool: 'saw', item: 'wood', amount: 3, kind: 'handcart', recipeId: 'build-handcart' },
  { tool: 'saw', item: 'wood', amount: 4, kind: 'boat', recipeId: 'build-boat' },
  { tool: 'hammer', item: 'wood', amount: 3, kind: 'woodenPier', recipeId: 'build-wooden-pier' },
  { tool: 'hammer', item: 'wood', amount: 4, kind: 'house', recipeId: 'build-house' },
  { tool: 'hammer', item: 'stone', amount: 2, kind: 'stoneMill', recipeId: 'build-stone-mill' },
];
