import type { Building, GameState, RecipeId, EntitySnapshot, BridgePierSnapshot } from './types';
import { bridgeCrossingPlan } from './bridge-crossing';
import { buildingMergeRecipe } from './merge-recipes';
import { validatePlacement, footprint } from './geometry';
import { stockTotal } from './commerce';
import { isDockShore, isLandCell } from './island';
import { worldSize } from './world';
import { isV5MarineCell } from './v5-marine';
import { integer, requireRule } from './guards';
export interface BuildingMergePlan {
  retainedId: string;
  consumedId: string;
  building: Building;
  recipeId: RecipeId;
  cost: number;
}
/** New construction reserves all water under the visible two-cell extension. Legacy saves remain loadable. */
export function hasDockExit(
  state: Pick<GameState, 'mapSeed' | 'terrainVersion' | 'landExtensions'>,
  building: Building,
): boolean {
  if (building.kind !== 'dock') return false;
  if (!isDockShore(building, state.mapSeed, state.terrainVersion, state.landExtensions))
    return false;
  const { width, depth } = footprint(building);
  for (let distance = 0; distance < 2; distance++)
    for (let offset = 0; offset < 2; offset++) {
      const x =
        building.rotation === 0 || building.rotation === 2
          ? building.x + offset
          : building.rotation === 1
            ? building.x + width + distance
            : building.x - 1 - distance;
      const z =
        building.rotation === 1 || building.rotation === 3
          ? building.z + offset
          : building.rotation === 0
            ? building.z + depth + distance
            : building.z - 1 - distance;
      if (
        !integer(x, worldSize(state.terrainVersion) - 1) ||
        !integer(z, worldSize(state.terrainVersion) - 1) ||
        isLandCell(x, z, state.mapSeed, state.terrainVersion, state.landExtensions) ||
        (state.terrainVersion === 5 && !isV5MarineCell(state.mapSeed, x, z, state.landExtensions))
      )
        return false;
    }
  return true;
}
/** Pure matching and placement plan, identical in both drag directions. Never consumes inputs. */
export function buildingMergePlan(
  state: GameState,
  sourceId: string,
  targetId: string,
  sources?: readonly EntitySnapshot[],
): BuildingMergePlan {
  const source = state.buildings.find((b) => b.id === sourceId),
    target = state.buildings.find((b) => b.id === targetId);
  requireRule(source && target && sourceId !== targetId, '合成部件不存在');
  if (source.kind === 'woodenPier' && target.kind === 'woodenPier') {
    const selected = sources ?? [source, target];
    requireRule(
      selected.length === 2 &&
        [sourceId, targetId].every((id) => selected.some((p) => p?.id === id)),
      '所选栈桥与合成目标不一致',
    );
    const plan = bridgeCrossingPlan(state, selected);
    const pier = (id: string): BridgePierSnapshot => {
      const b = state.buildings.find((p) => p.id === id)!;
      return { id: b.id, kind: 'woodenPier', x: b.x, z: b.z, rotation: b.rotation };
    };
    const building: Building = {
      id: plan.retainedId,
      kind: 'woodenBridge',
      x: plan.x,
      z: plan.z,
      rotation: plan.rotation,
      bridge: { length: plan.length, piers: [pier(plan.retainedId), pier(plan.consumedId)] },
    };
    validatePlacement(
      { ...state, buildings: state.buildings.filter((b) => b.id !== plan.consumedId) },
      building,
    );
    return {
      retainedId: plan.retainedId,
      consumedId: plan.consumedId,
      building,
      recipeId: 'build-wooden-bridge',
      cost: 0,
    };
  }
  const recipe = buildingMergeRecipe(source.kind, target.kind);
  requireRule(recipe, '此组合没有可用配方');
  const base = source.kind === recipe.base ? source : target,
    addition = source.kind === recipe.base ? target : source;
  requireRule(
    !base.job &&
      !addition.job &&
      !base.processingJob &&
      !addition.processingJob &&
      !base.cropJobs?.some(Boolean) &&
      !addition.cropJobs?.some(Boolean),
    '请先领取生产任务后合成',
  );
  const count = [base.id, addition.id].reduce(
    (n, id) => n + (state.fusion.attachments[id] ? stockTotal(state.fusion.attachments[id]!) : 0),
    0,
  );
  requireRule(count <= 5, '两座建筑的挂载材料超过5份，请先取回部分材料');
  const building: Building = { ...base, kind: recipe.result };
  const cleared = { ...state, buildings: state.buildings.filter((b) => b.id !== addition.id) };
  validatePlacement(cleared, building);
  return {
    retainedId: base.id,
    consumedId: addition.id,
    building,
    recipeId: recipe.recipeId,
    cost: 0,
  };
}
