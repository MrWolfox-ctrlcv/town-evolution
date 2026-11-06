import type { Building, BuildingKind, Command, EntitySnapshot, GameState, RecipeId } from './types';
import { stockTotal } from './commerce';
import { dockAssemblyPlan } from './dock-assembly';
import { validatePlacement } from './geometry';
import { requireRule } from './guards';
import { createLocalContainer } from './local-container';
import { FUSION } from './recipes';

export type { EntitySnapshot } from './types';
export type HammerAssemblyCommand = Extract<Command, { type: 'hammerAssembly' }>;
export interface EntityAssemblyPlan {
  retainedId: string;
  consumedIds: string[];
  building: Building;
  recipeId: RecipeId;
  cost: 0;
}

interface PairRecipe {
  base: BuildingKind;
  addition: BuildingKind;
  result: BuildingKind;
  recipeId: RecipeId;
}
const PAIR_RECIPES: readonly PairRecipe[] = [
  { base: 'house', addition: 'crate', result: 'warehouse', recipeId: 'build-warehouse' },
  { base: 'house', addition: 'orderBoard', result: 'shop', recipeId: 'build-shop' },
  {
    base: 'warehouse',
    addition: 'handcart',
    result: 'transportWarehouse',
    recipeId: 'build-transport-warehouse',
  },
  { base: 'farm', addition: 'crate', result: 'farm', recipeId: 'attach-farm-box' },
];

/** Resolve only the explicitly selected entities, rejecting stale position or kind snapshots. */
function resolveSources(state: GameState, sources: readonly EntitySnapshot[]): Building[] {
  requireRule(
    Array.isArray(sources) && (sources.length === 2 || sources.length === 3),
    '请选择两个或三个装配部件',
  );
  const seen = new Set<string>();
  return sources.map((snapshot) => {
    requireRule(
      snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot),
      '装配部件快照无效',
    );
    requireRule(typeof snapshot.id === 'string' && !seen.has(snapshot.id), '装配部件不能重复');
    seen.add(snapshot.id);
    const building = state.buildings.find((b) => b.id === snapshot.id);
    requireRule(building, '所选装配部件不存在');
    requireRule(
      building.kind === snapshot.kind &&
        building.x === snapshot.x &&
        building.z === snapshot.z &&
        building.rotation === snapshot.rotation,
      '所选装配部件已变化，请重新选择',
    );
    return building;
  });
}

/** Pure preview/commit contract. Never searches for substitutes or uses town inventory. */
export function entityAssemblyPlan(
  state: GameState,
  sources: readonly EntitySnapshot[],
): EntityAssemblyPlan {
  const inputs = resolveSources(state, sources);
  const attachingFarmBox =
    inputs.length === 2 &&
    inputs.some((b) => b.kind === 'farm') &&
    inputs.some((b) => b.kind === 'crate');
  requireRule(
    inputs.every(
      (b) =>
        !b.job &&
        !b.processingJob &&
        (!b.cropJobs?.some(Boolean) || (attachingFarmBox && b.kind === 'farm')),
    ),
    '请先领取部件上的生产任务后装配',
  );
  requireRule(
    inputs.every((b) => !b.collectionBox),
    '这块田已有收获箱，不能重复装配或消耗已有收获箱',
  );
  requireRule(
    inputs.reduce(
      (total, b) =>
        total + (state.fusion.attachments[b.id] ? stockTotal(state.fusion.attachments[b.id]!) : 0),
      0,
    ) <= FUSION.attachmentLimit,
    '部件上的挂载材料超过容量，请先取回部分材料',
  );
  if (inputs.length === 3) {
    const pier = inputs.find((b) => b.kind === 'woodenPier'),
      crate = inputs.find((b) => b.kind === 'crate'),
      board = inputs.find((b) => b.kind === 'orderBoard');
    requireRule(pier && crate && board, '船坞需要木栈桥、箱子和公告牌三个部件');
    return dockAssemblyPlan(state, pier.id, crate.id, board.id);
  }
  const recipe = PAIR_RECIPES.find(
    (r) => inputs.some((b) => b.kind === r.base) && inputs.some((b) => b.kind === r.addition),
  );
  requireRule(recipe, '此组合没有可用的锤子装配配方');
  const base = inputs.find((b) => b.kind === recipe.base)!,
    addition = inputs.find((b) => b.kind === recipe.addition)!;
  const building: Building = { ...base, kind: recipe.result };
  if (recipe.recipeId === 'attach-farm-box') {
    requireRule(!state.fusion.attachments[addition.id], '请先取回箱子的挂载物品');
    building.collectionBox = { crateId: addition.id, ...createLocalContainer() };
  }
  const cleared = {
    ...state,
    buildings: state.buildings.filter((b) => b.id !== addition.id),
  };
  validatePlacement(cleared, building);
  return {
    retainedId: base.id,
    consumedIds: [addition.id],
    building,
    recipeId: recipe.recipeId,
    cost: 0,
  };
}
