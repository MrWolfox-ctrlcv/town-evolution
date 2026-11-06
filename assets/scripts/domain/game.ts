export { createBridgeDemo, BRIDGE_DEMO_SEED } from './bridge-demo';
export { bridgeCrossingPlan } from './bridge-crossing';
export { BRIDGE_CROSSING, bridgeSpanCells, validateBridgeTerrain } from './bridge-terrain';
export type { BridgeTerrainPlan } from './bridge-terrain';
import { depositCompost, collectCompost, withdrawCompostInput } from './actions/compost';
export {
  COMPOST_BALANCE,
  COMPOST_ITEMS,
  compostStage,
  compostOccupied,
  compostFreeSpace,
  isCompostItem,
} from './compost';
export { entityAssemblyPlan } from './entity-assembly';
export type { EntityAssemblyPlan, HammerAssemblyCommand } from './entity-assembly';
import { hammerAssembly } from './actions/entity-assembly';
export { farmBoxCell, buildingOccupiedCells, buildingOccupiesCell } from './building-cells';
export { farmCellAtSixths } from './farm-coordinates';
export { dockAssemblyPlan } from './dock-assembly';
export type { DockAssemblyPlan } from './dock-assembly';
import { withdrawFarmBox } from './actions/farm-box';
export { dropMovePlan, stackIntoDropPlan } from './drop-move';
export type { DropMovePlan } from './drop-move';
import { pickupDrop, moveDrop, mergeStackIntoDrop } from './actions/loose-drops';
export { dropPosition, cropDropAnchor, LOOSE_DROPS } from './loose-drops';
export { LOCAL_CONTAINER } from './local-container';
/** Public business-layer facade. Rendering and storage depend on this layer, never the reverse. */
export * from './types';
export { farmGridSize, farmCellCount, farmLabel, farmMergePreview } from './farming';
import { seedNursery, waterNursery, plantSapling } from './actions/nursery';
import { startProcessing, collectProcessing } from './actions/processing';
import { transportDeliver } from './actions/transport';
export { NURSERY, nurseryStage, isTreeMature, treeGrowthProgress } from './nursery';
export { PROCESSING_RECIPES, processingStage } from './processing';
import { craftMixed } from './actions/mixed-crafting';
export { mixedCraftPlan } from './mixed-crafting';
export type { MixedCraftRequest, MixedCraftPlan } from './mixed-crafting';
export { toolCraftPlan } from './tool-crafting';
export { hasDockExit, buildingMergePlan } from './merge-plan';
export type { BuildingMergePlan } from './merge-plan';
import { digFarm, irrigateFarm } from './actions/farming';
export {
  RECIPE_DEFINITIONS,
  ACTIVE_RECIPE_DEFINITIONS,
  FUSION,
  canMergeBuildings,
} from './recipes';
import { recordRecipe } from './fusion-state';
import { waterSoil, expandLand } from './actions/mud';
import { transferMaterial, hammerBuilding } from './actions/fusion';
export { createDemoGame, DEMO_SEED } from './demo';
export {
  COMMERCE,
  hasTradeFacility,
  TRADE_ITEMS,
  isTradableItem,
  isGroundTradeItem,
} from './commerce';
export {
  TOOLS,
  TOOL_IDS,
  ACTIVE_TOOLS,
  FOUNDATION,
  UNLIMITED_TOOL_DURABILITY,
  hasUnlimitedDurability,
  toolRefill,
  stackLimitFor,
} from './foundation';
export { terrainAt } from './terrain';
export type { TerrainBiome, TerrainCell } from './terrain';
export { isLandCell, isLand, landCellCount, isDockShore } from './island';
export { CROPS, CROP_KEYS, ITEM_KEYS, isCrop } from './crops';
export { CONFIG, ORDERS } from './config';
export { createGame, advance, getCapacity, getUsedStorage } from './state';
export { footprint, adjacent } from './geometry';
export { sawCraftPlan } from './saw-crafting';
export type { SawCraftPlan } from './saw-crafting';
export { importSave, exportSave, SaveVersionError } from './save';
import type { GameState, Command, Result } from './types';
import { recoverCrop, buyCrop } from './planting';
export { hasPlantingSource } from './planting';
import { replenishTool } from './foundation';
import {
  placeTree,
  transferGround,
  applyTool,
  craftGroundTool,
  moveStack,
  pickupStack,
  gatherNatural,
} from './actions/ground';
import { clone } from './state';
import { time, requireRule } from './guards';
import {
  combine,
  dragMerge,
  repurposeToBoard,
  moveBuilding,
  rotateBuilding,
} from './actions/construction';
import { start, collect, plantCell, harvestCell } from './actions/production';
import { shopTrade, orderFulfill, dockTransfer, dockShip, dockCollect } from './actions/commerce';
import { sell } from './actions/orders';

/** Rejected actions retain the exact original object; successful actions publish a new snapshot. */
export function dispatch(state: GameState, command: Command, now: number): Result {
  try {
    time(now);
    requireRule(command && typeof command === 'object', '操作无效');
    const next = clone(state);
    const effectiveNow = Math.max(state.lastSeenAt, now);
    let events: string[];
    switch (command.type) {
      case 'depositCompost':
        events = depositCompost(next, command, effectiveNow);
        break;
      case 'collectCompost':
        events = collectCompost(next, command, effectiveNow);
        break;
      case 'withdrawCompostInput':
        events = withdrawCompostInput(next, command);
        break;
      case 'moveDrop':
        events = moveDrop(next, command);
        break;
      case 'mergeStackIntoDrop':
        events = mergeStackIntoDrop(next, command);
        break;
      case 'pickupDrop':
        events = pickupDrop(next, command);
        break;
      case 'attachFarmBox':
        throw new Error('请明确选择田地和箱子，再用锤子装配');
      case 'hammerAssembly':
        events = hammerAssembly(next, command);
        break;
      case 'withdrawFarmBox':
        events = withdrawFarmBox(next, command);
        break;
      case 'craftMixed':
        events = craftMixed(next, command);
        break;
      case 'buildNursery':
        throw new Error('请先把泥放在箱子上，再用锤子合成');
      case 'seedNursery':
        events = seedNursery(next, command);
        break;
      case 'plantSapling':
        events = plantSapling(next, command, effectiveNow);
        break;
      case 'startProcessing':
        events = startProcessing(next, command, effectiveNow);
        break;
      case 'collectProcessing':
        events = collectProcessing(next, command, effectiveNow);
        break;
      case 'transportDeliver':
        events = transportDeliver(next, command);
        break;
      case 'attachMaterial':
      case 'detachMaterial':
        events = transferMaterial(next, command);
        break;
      case 'buyTool':
      case 'recoverTool':
        events = replenishTool(next, command.tool, command.type === 'recoverTool');
        break;
      case 'gatherNatural':
        events = gatherNatural(next, command);
        break;
      case 'placeTree':
        events = placeTree(next, command);
        break;
      case 'dropProduct':
      case 'pickupProduct':
        events = transferGround(next, command);
        break;
      case 'expandLand':
        events = expandLand(next, command);
        break;
      case 'buildResidence':
        throw new Error('请先把泥放在房屋上，再用锤子合成');
      case 'useTool':
        if (command.tool === 'diggingTool') {
          events = digFarm(next, command);
          break;
        }
        if (command.tool === 'wateringCan' && 'buildingId' in command) {
          events =
            next.buildings.find((b) => b.id === command.buildingId)?.kind === 'nursery'
              ? waterNursery(next, command.buildingId, effectiveNow)
              : irrigateFarm(next, command.buildingId);
          break;
        }
        if (command.tool === 'wateringCan' && 'sources' in command) {
          events = waterSoil(next, command);
          break;
        }
        events =
          command.tool === 'hammer'
            ? 'buildingId' in command
              ? hammerBuilding(next, command.buildingId)
              : craftGroundTool(next, command)
            : applyTool(next, command, effectiveNow);
        break;
      case 'repurposeToBoard':
        events = repurposeToBoard(next, command);
        break;
      case 'pickupStack':
        events = pickupStack(next, command);
        break;
      case 'moveStack':
        events = moveStack(next, command);
        break;
      case 'rotateBuilding':
        events = rotateBuilding(next, command);
        break;
      case 'moveBuilding':
        events = moveBuilding(next, command);
        break;
      case 'plantCell':
        events = plantCell(next, command, effectiveNow);
        break;
      case 'harvestCell':
        events = harvestCell(next, command, effectiveNow);
        break;
      case 'buyCrop':
        events = buyCrop(next, command);
        break;
      case 'recoverCrop':
        events = recoverCrop(next);
        break;
      // Keep legacy commands recognizable, but never turn stale UI intent into a purchase.
      case 'place':
        throw new Error('普通建造已暂停，请通过材料合成构建');
      case 'upgrade':
        throw new Error('金币扩容已暂停，请给仓房添加木材并使用锤子');
      case 'combine':
        events = combine(next, command, effectiveNow);
        break;
      case 'dragMerge':
        events = dragMerge(next, command, effectiveNow);
        break;
      case 'start':
        events = start(next, command, effectiveNow);
        break;
      case 'collect':
        events = collect(next, command, effectiveNow);
        break;
      case 'shopTrade':
        events = shopTrade(next, command);
        break;
      case 'orderFulfill':
        events = orderFulfill(next, command);
        break;
      case 'dockTransfer':
        events = dockTransfer(next, command);
        break;
      case 'dockShip':
        events = dockShip(next, command, effectiveNow);
        break;
      case 'dockCollect':
        events = dockCollect(next, command, effectiveNow);
        break;
      case 'sell':
        events = sell(next, command, effectiveNow);
        break;
      default:
        throw new Error('未知操作');
    }
    next.lastSeenAt = effectiveNow;
    const discovered = recordRecipe(next, command, effectiveNow, state);
    if (discovered) events.push(`图鉴新发现：${discovered}`);
    return { ok: true, state: next, events };
  } catch (error) {
    return { ok: false, state, error: error instanceof Error ? error.message : '操作失败' };
  }
}

export { worldSize, WORLD_SIZE, MAX_TERRAIN_HEIGHT } from './world';
export type { TerrainVersion } from './world';
