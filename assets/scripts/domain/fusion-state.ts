import { entityAssemblyPlan } from './entity-assembly';
import type { FusionState, GameState, Building, Command, RecipeId } from './types';
import { emptyStock, stockTotal } from './commerce';
import { ITEM_KEYS } from './crops';
import { TOOL_CRAFT_RECIPES } from './craft-recipes';
import { MAX_VALUE } from './config';
import { integer, requireRule } from './guards';
import { importStock } from './stock-save';
import { FUSION, RECIPE_DEFINITIONS } from './recipes';
export function emptyFusion(): FusionState {
  return { attachments: {}, discoveries: {} };
}
export function cloneFusion(fusion: FusionState): FusionState {
  return {
    attachments: Object.fromEntries(
      Object.entries(fusion.attachments).map(([id, stock]) => [id, { ...stock }]),
    ),
    discoveries: Object.fromEntries(
      Object.entries(fusion.discoveries).map(([id, d]) => [id, { ...d }]),
    ),
  };
}
function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
/** Additive schema8 extension. Only absence means a pre-checkpoint save; malformed data rejects. */
export function importFusion(
  raw: unknown,
  buildings: Building[],
  now: number,
  sourceVersion: 8 | 9 | 10 = 10,
): FusionState {
  if (raw === undefined) return emptyFusion();
  requireRule(record(raw) && record(raw.attachments) && record(raw.discoveries), '融合记录无效');
  const result = emptyFusion();
  for (const [id, value] of Object.entries(raw.attachments)) {
    requireRule(buildings.some((b) => b.id === id) && record(value), '挂载材料的建筑不存在');
    requireRule(
      Object.keys(value).every((key) => ITEM_KEYS.includes(key as never)),
      '未知挂载材料',
    );
    const stock = importStock(value, sourceVersion);
    requireRule(
      stockTotal(stock) > 0 && stockTotal(stock) <= FUSION.attachmentLimit,
      '挂载材料超过容量或为空',
    );
    result.attachments[id] = stock;
  }
  for (const [id, value] of Object.entries(raw.discoveries)) {
    requireRule(RECIPE_DEFINITIONS.some((r) => r.id === id) && record(value), '未知图鉴记录');
    requireRule(
      integer(value.count) && value.count > 0 && integer(value.firstDiscoveredAt, now),
      '图鉴次数或时间无效',
    );
    result.discoveries[id as RecipeId] = {
      count: value.count,
      firstDiscoveredAt: value.firstDiscoveredAt,
    };
  }
  return result;
}
/** Called only after a successful atomic command, never for previews or paid shortcut upgrades. */
export function recordRecipe(
  s: GameState,
  command: Command,
  now: number,
  before: GameState,
): string | undefined {
  let id: RecipeId | undefined;
  if (command.type === 'useTool') {
    if (command.tool === 'diggingTool') id = 'dig-farm';
    else if (command.tool === 'wateringCan' && 'buildingId' in command) {
      if (before.buildings.find((b) => b.id === command.buildingId)?.kind === 'farm')
        id = 'irrigate-farm';
    } else if (command.tool === 'wateringCan' && 'sources' in command) id = 'water-soil';
    else if (command.tool === 'axe') id = 'gather-wood';
    else if (command.tool === 'hammer' && 'buildingId' in command) {
      const kind = before.buildings.find((b) => b.id === command.buildingId)?.kind;
      id =
        kind === 'house'
          ? 'build-residence'
          : kind === 'crate'
            ? s.buildings.find((b) => b.id === command.buildingId)?.kind === 'compostBarrel'
              ? 'build-compost-barrel'
              : 'build-nursery'
            : 'expand-warehouse';
    } else if ((command.tool === 'saw' || command.tool === 'hammer') && 'x' in command) {
      const pile = before.groundStacks.find((p) => p.x === command.x && p.z === command.z);
      id = TOOL_CRAFT_RECIPES.find(
        (r) => r.tool === command.tool && r.item === pile?.item && r.amount === pile?.amount,
      )?.recipeId;
    }
  }
  if (command.type === 'hammerAssembly') id = entityAssemblyPlan(before, command.sources).recipeId;
  if (command.type === 'attachFarmBox') id = 'attach-farm-box';
  if (command.type === 'craftMixed') id = 'build-stone-oven';
  if (command.type === 'buildNursery') id = 'build-nursery';
  if (command.type === 'plantSapling') id = 'plant-sapling';
  if (
    command.type === 'collect' &&
    before.buildings.find((b) => b.id === command.buildingId)?.kind === 'nursery'
  )
    id = 'grow-sapling';
  if (command.type === 'collectCompost') id = 'make-fertilizer';
  if (command.type === 'collectProcessing')
    id = before.buildings.find((b) => b.id === command.buildingId)?.processingJob?.recipeId;
  if (
    command.type === 'harvestCell' &&
    before.buildings.find((b) => b.id === command.buildingId)?.cropJobs?.[command.cell]?.crop ===
      'rice'
  )
    id = 'grow-rice';
  if (command.type === 'gatherNatural') {
    // Successful soil excavation and the final stone remove their source from the result.
    const source = before.naturalResources.find((resource) => resource.id === command.resourceId);
    if (source?.kind === 'soil') id = 'gather-soil';
    else if (source?.kind === 'stone') id = 'gather-stone';
  }
  if (command.type === 'expandLand') id = 'expand-land';
  if (command.type === 'buildResidence') id = 'build-residence';
  if (command.type === 'combine') id = 'merge-cold';
  if (command.type === 'dragMerge') {
    const result = s.buildings.find((b) => b.id === command.sourceId || b.id === command.targetId);
    if (result?.kind === 'farm' && result.farmSize === 6) id = 'merge-farms';
    else if (result?.kind === 'warehouse') id = 'build-warehouse';
    else if (result?.kind === 'shop') id = 'build-shop';
    else if (result?.kind === 'coldWarehouse') id = 'merge-cold';
    else if (result?.kind === 'mill') id = 'build-mill';
    else if (result?.kind === 'bakery') id = 'build-bakery';
    else if (result?.kind === 'transportWarehouse') id = 'build-transport-warehouse';
    else if (result?.kind === 'dock') id = 'build-dock';
    else if (result?.kind === 'woodenBridge') id = 'build-wooden-bridge';
  }
  if (!id) return;
  const old = s.fusion.discoveries[id];
  s.fusion.discoveries[id] = {
    count: Math.min(MAX_VALUE, (old?.count ?? 0) + 1),
    firstDiscoveredAt: old?.firstDiscoveredAt ?? now,
  };
  const recipe = RECIPE_DEFINITIONS.find((recipe) => recipe.id === id);
  return !old && recipe?.availability === 'active' ? recipe.title : undefined;
}
export function mergeAttachments(s: GameState, retained: string, consumed: string): void {
  const left = s.fusion.attachments[retained],
    right = s.fusion.attachments[consumed];
  if (!right) return;
  const stock = { ...(left ?? emptyStock()) };
  for (const item of ITEM_KEYS) stock[item] += right[item];
  requireRule(
    stockTotal(stock) <= FUSION.attachmentLimit,
    '两座建筑的挂载材料超过5份，请先取回部分材料',
  );
  s.fusion.attachments[retained] = stock;
  delete s.fusion.attachments[consumed];
}
