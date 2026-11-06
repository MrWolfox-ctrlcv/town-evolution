import type { GameState } from '../types';
import type { MixedCraftRequest } from '../mixed-crafting';
import { mixedCraftPlan } from '../mixed-crafting';
import { requireRule } from '../guards';
import { nextId } from '../state';
import { useDurability } from '../foundation';
export function craftMixed(state: GameState, request: MixedCraftRequest): string[] {
  const plan = mixedCraftPlan(state, request);
  requireRule(plan.building && !plan.reason, plan.reason ?? '所选组合不可用');
  useDurability(state, 'hammer');
  const keys = new Set(request.sources.map((p) => `${p.x},${p.z}`));
  state.groundStacks = state.groundStacks.flatMap((p) =>
    keys.has(`${p.x},${p.z}`) ? (p.amount === 1 ? [] : [{ ...p, amount: p.amount - 1 }]) : [p],
  );
  state.buildings.push({ ...plan.building, id: nextId(state, 'b') });
  return ['已组合成石窑'];
}
