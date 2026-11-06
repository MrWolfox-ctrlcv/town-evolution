import type { GameState } from '../types';
import type { HammerAssemblyCommand } from '../entity-assembly';
import { entityAssemblyPlan } from '../entity-assembly';
import { initializeFacility } from '../commerce';
import { CONFIG } from '../config';
import { useDurability } from '../foundation';
import { mergeAttachments } from '../fusion-state';
import { requireRule } from '../guards';

/** All source, capacity and final-placement checks finish before any deduction. */
export function hammerAssembly(state: GameState, command: HammerAssemblyCommand): string[] {
  requireRule(command.tool === 'hammer', '装配需要使用锤子');
  const plan = entityAssemblyPlan(state, command.sources);
  useDurability(state, 'hammer');
  for (const consumedId of plan.consumedIds) mergeAttachments(state, plan.retainedId, consumedId);
  const consumed = new Set(plan.consumedIds);
  state.buildings = state.buildings
    .filter((b) => !consumed.has(b.id))
    .map((b) => (b.id === plan.retainedId ? plan.building : b));
  initializeFacility(state.commerce, plan.building);
  return [
    plan.recipeId === 'attach-farm-box'
      ? '已为田地装上收获箱，挥镰刀后作物进入箱内'
      : `装配完成：${CONFIG.buildings[plan.building.kind].label}`,
  ];
}
