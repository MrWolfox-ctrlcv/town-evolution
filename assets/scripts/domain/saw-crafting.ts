import type { GameState } from './types';
import { toolCraftPlan } from './tool-crafting';
export type { ToolCraftPlan as SawCraftPlan } from './tool-crafting';
/** Compatibility entry point for existing saw previews. */
export function sawCraftPlan(state: GameState, x: number, z: number) {
  return toolCraftPlan(state, 'saw', x, z);
}
