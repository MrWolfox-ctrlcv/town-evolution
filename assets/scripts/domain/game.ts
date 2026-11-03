/** Public business-layer facade. Rendering and storage depend on this layer, never the reverse. */
export * from './types';
export { RECIPE_DEFINITIONS, FUSION } from './recipes';
import { recordRecipe } from './fusion-state';
import { transferMaterial, hammerBuilding } from './actions/fusion';
export { createDemoGame, DEMO_SEED } from './demo';
export { COMMERCE, hasTradeFacility } from './commerce';
export { TOOLS, TOOL_IDS, ACTIVE_TOOLS, FOUNDATION, toolRefill } from './foundation';
export { isLandCell, isLand, landCellCount, isDockShore } from './island';
export { CROPS, CROP_KEYS, ITEM_KEYS, isCrop } from './crops';
export { CONFIG, ORDERS } from './config';
export { createGame, advance, getCapacity, getUsedStorage } from './state';
export { footprint, adjacent } from './geometry';
export { importSave, exportSave, SaveVersionError } from './save';
import type { GameState, Command, Result } from './types';
import { recoverCrop, buyCrop } from './planting';
export { hasPlantingSource } from './planting';
import { replenishTool } from './foundation';
import { placeTree, transferGround, applyTool, moveStack, pickupStack } from './actions/ground';
import { clone } from './state';
import { time, requireRule } from './guards';
import {
  place,
  upgrade,
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
      case 'attachMaterial':
      case 'detachMaterial':
        events = transferMaterial(next, command);
        break;
      case 'buyTool':
      case 'recoverTool':
        events = replenishTool(next, command.tool, command.type === 'recoverTool');
        break;
      case 'placeTree':
        events = placeTree(next, command);
        break;
      case 'dropProduct':
      case 'pickupProduct':
        events = transferGround(next, command);
        break;
      case 'useTool':
        events =
          command.tool === 'hammer'
            ? hammerBuilding(next, command.buildingId)
            : applyTool(next, command);
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
      case 'place':
        events = place(next, command, effectiveNow);
        break;
      case 'upgrade':
        events = upgrade(next, command, effectiveNow);
        break;
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
    const discovered = recordRecipe(next, command, effectiveNow);
    if (discovered) events.push(`图鉴新发现：${discovered}`);
    return { ok: true, state: next, events };
  } catch (error) {
    return { ok: false, state, error: error instanceof Error ? error.message : '操作失败' };
  }
}
