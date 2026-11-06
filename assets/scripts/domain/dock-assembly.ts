import type { Building, GameState } from './types';
import { stockTotal } from './commerce';
import { validatePlacement } from './geometry';
import { hasDockExit } from './merge-plan';
import { requireRule } from './guards';
export interface DockAssemblyPlan {
  retainedId: string;
  consumedIds: [string, string];
  building: Building;
  recipeId: 'build-dock';
  cost: 0;
}
/** Planning only. A pier, a crate and a notice board must all be explicitly identified. */
export function dockAssemblyPlan(
  state: GameState,
  pierId: string,
  crateId: string,
  boardId: string,
): DockAssemblyPlan {
  requireRule(new Set([pierId, crateId, boardId]).size === 3, '请明确选择三个不同部件');
  const pier = state.buildings.find((b) => b.id === pierId),
    crate = state.buildings.find((b) => b.id === crateId),
    board = state.buildings.find((b) => b.id === boardId);
  requireRule(
    pier?.kind === 'woodenPier' && crate?.kind === 'crate' && board?.kind === 'orderBoard',
    '船坞部件不完整',
  );
  const inputs = [pier, crate, board];
  requireRule(
    inputs.every(
      (b) => !b.job && !b.processingJob && !b.cropJobs?.some(Boolean) && !b.collectionBox,
    ),
    '请先完成部件上的生产',
  );
  requireRule(
    inputs.reduce(
      (n, b) =>
        n + (state.fusion.attachments[b.id] ? stockTotal(state.fusion.attachments[b.id]!) : 0),
      0,
    ) <= 5,
    '部件上的挂载材料超过容量',
  );
  const cleared = {
    ...state,
    buildings: state.buildings.filter((b) => b.id !== crateId && b.id !== boardId),
  };
  const building: Building = { ...pier, kind: 'dock', dockStyle: 'simple' };
  let found = false;
  for (let step = 0; step < 4; step++) {
    building.rotation = ((pier.rotation + step) % 4) as Building['rotation'];
    if (hasDockExit(cleared, building)) {
      found = true;
      break;
    }
  }
  requireRule(found, '简易船坞需要合法海岸和连续两格海面出口');
  validatePlacement(cleared, building);
  return {
    retainedId: pierId,
    consumedIds: [crateId, boardId],
    building,
    recipeId: 'build-dock',
    cost: 0,
  };
}
