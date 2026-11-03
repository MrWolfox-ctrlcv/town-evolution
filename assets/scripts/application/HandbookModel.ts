import type { GameState, Item } from '../domain/game';
import { RECIPE_DEFINITIONS } from '../domain/recipes';
import type { RecipeDefinition } from '../domain/recipes';

/** Read-only handbook projection. Attached materials never count as loose inventory. */
export function handbookEntry(state: GameState, recipe: RecipeDefinition) {
  const discovery = state.fusion.discoveries[recipe.id];
  const materials = recipe.ingredients.map((ingredient) => {
    const item = ingredient.kind as Item;
    const inventory = state.inventory[item] ?? 0;
    const ground = state.groundStacks.reduce(
      (n, stack) => n + (stack.item === item ? stack.amount : 0),
      0,
    );
    const attached = Object.values(state.fusion.attachments).reduce(
      (n, stock) => n + (stock[item] ?? 0),
      0,
    );
    const buildings = state.buildings.filter(
      (building) => building.kind === ingredient.kind,
    ).length;
    const trees = ingredient.kind === 'tree' ? state.trees.length : 0;
    const targetAttached =
      recipe.id === 'expand-warehouse' && ingredient.kind === 'wood'
        ? Math.max(
            0,
            ...state.buildings
              .filter((building) => building.kind === 'warehouse')
              .map((building) => state.fusion.attachments[building.id]?.[item] ?? 0),
          )
        : 0;
    const available = inventory + ground + buildings + trees + targetAttached;
    return {
      ...ingredient,
      inventory,
      ground,
      attached,
      targetAttached,
      attachmentMissing: Math.max(0, ingredient.amount - targetAttached),
      available,
      missing: Math.max(0, ingredient.amount - available),
    };
  });
  return { recipe, count: discovery?.count ?? 0, discovered: Boolean(discovery), materials };
}
export function handbookProgress(state: GameState) {
  return RECIPE_DEFINITIONS.filter((recipe) => Boolean(state.fusion.discoveries[recipe.id])).length;
}
