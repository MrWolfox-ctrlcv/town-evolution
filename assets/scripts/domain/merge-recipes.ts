import type { BuildingKind, RecipeId } from './types';
export interface BuildingMergeRecipe {
  base: BuildingKind;
  addition: BuildingKind;
  result: BuildingKind;
  recipeId: RecipeId;
}
export const BUILDING_MERGE_RECIPES: readonly BuildingMergeRecipe[] = [
  { base: 'house', addition: 'crate', result: 'warehouse', recipeId: 'build-warehouse' },
  { base: 'house', addition: 'orderBoard', result: 'shop', recipeId: 'build-shop' },
  { base: 'house', addition: 'stoneMill', result: 'mill', recipeId: 'build-mill' },
  { base: 'house', addition: 'stoneOven', result: 'bakery', recipeId: 'build-bakery' },
  {
    base: 'warehouse',
    addition: 'handcart',
    result: 'transportWarehouse',
    recipeId: 'build-transport-warehouse',
  },
];
export function buildingMergeRecipe(left: BuildingKind, right: BuildingKind) {
  return BUILDING_MERGE_RECIPES.find(
    (r) => (r.base === left && r.addition === right) || (r.base === right && r.addition === left),
  );
}
