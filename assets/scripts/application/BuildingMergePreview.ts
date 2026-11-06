import { buildingMergePlan, farmMergePreview, CONFIG } from '../domain/game';
import type { Building, Command, GameState } from '../domain/game';
/** The exact domain result drives the ghost, cost and post-commit focus. */
export function buildingMergePreview(
  state: GameState,
  command: Extract<Command, { type: 'dragMerge' }>,
) {
  const a = state.buildings.find((b) => b.id === command.sourceId),
    b = state.buildings.find((b) => b.id === command.targetId);
  if (!a || !b) throw new Error('对象已改变');
  if (a.kind === 'farm' && b.kind === 'farm') {
    const plan = farmMergePreview(state, a.id, b.id);
    return { building: plan.building, retainedId: b.id, cost: 0 };
  }
  if ([a.kind, b.kind].includes('warehouse') && [a.kind, b.kind].includes('cooler')) {
    const retained = a.kind === 'warehouse' ? a : b;
    return {
      building: { ...retained, kind: 'coldWarehouse' } as Building,
      retainedId: retained.id,
      cost: CONFIG.combineCost,
    };
  }
  return buildingMergePlan(state, a.id, b.id, command.sources);
}
