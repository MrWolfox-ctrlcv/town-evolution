import { COMPOST_ITEMS, COMPOST_BALANCE } from '../domain/game';
import type { GameState, Item } from '../domain/game';
import { ACTIVE_RECIPE_DEFINITIONS } from '../domain/recipes';
import type { RecipeDefinition } from '../domain/recipes';

/** Read-only handbook projection. Attached materials never count as loose inventory. */
export function handbookEntry(state: GameState, recipe: RecipeDefinition) {
  const discovery = state.fusion.discoveries[recipe.id];
  const materials = recipe.ingredients.map((ingredient) => {
    const item = ingredient.kind as Item;
    const choices: readonly Item[] = recipe.id === 'make-fertilizer' ? COMPOST_ITEMS : [item];
    const amount =
      recipe.id === 'make-fertilizer' ? COMPOST_BALANCE.inputAmount : ingredient.amount;
    const inventory = choices.reduce((sum, item) => sum + (state.inventory[item] ?? 0), 0);
    const ground = state.groundStacks.reduce(
      (n, stack) => n + (choices.includes(stack.item) ? stack.amount : 0),
      0,
    );
    const loose = (state.looseDrops ?? []).reduce(
      (sum, drop) => sum + (choices.includes(drop.item) ? drop.amount : 0),
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
    const naturalKind =
      ingredient.kind === 'soilMound'
        ? 'soil'
        : ingredient.kind === 'stoneDeposit'
          ? 'stone'
          : null;
    const natural = state.naturalResources.filter(
      (resource) => resource.kind === naturalKind,
    ).length;
    const targetAttached =
      recipe.id === 'expand-warehouse' && ingredient.kind === 'wood'
        ? Math.max(
            0,
            ...state.buildings
              .filter((building) => building.kind === 'warehouse')
              .map((building) => state.fusion.attachments[building.id]?.[item] ?? 0),
          )
        : 0;
    const available = inventory + ground + loose + buildings + trees + natural + targetAttached;
    return {
      ...ingredient,
      amount,
      choices,
      inventory,
      loose,
      ground,
      attached,
      targetAttached,
      attachmentMissing: Math.max(0, ingredient.amount - targetAttached),
      available,
      missing: Math.max(0, amount - available),
    };
  });
  return { recipe, count: discovery?.count ?? 0, discovered: Boolean(discovery), materials };
}
export function handbookProgress(state: GameState) {
  return ACTIVE_RECIPE_DEFINITIONS.filter((recipe) => Boolean(state.fusion.discoveries[recipe.id]))
    .length;
}

export const HANDBOOK_PAGE_SIZE = 4;

function wrapIndex(index: number, count: number): number {
  return count ? ((index % count) + count) % count : 0;
}

/** Directory, detail pagination and discovery goals share one active-only projection. */
export function handbookView(state: GameState, selection = 0, page = 0) {
  const entries = ACTIVE_RECIPE_DEFINITIONS.map((recipe) => handbookEntry(state, recipe));
  const selected = wrapIndex(selection, entries.length);
  const directoryPageCount = Math.ceil(entries.length / HANDBOOK_PAGE_SIZE);
  const directoryPage = wrapIndex(page, directoryPageCount);
  return {
    entries,
    selected,
    directoryPage,
    directoryPageCount,
    directoryEntries: entries.slice(
      directoryPage * HANDBOOK_PAGE_SIZE,
      (directoryPage + 1) * HANDBOOK_PAGE_SIZE,
    ),
    detail: entries[selected],
    progress: handbookProgress(state),
  };
}
