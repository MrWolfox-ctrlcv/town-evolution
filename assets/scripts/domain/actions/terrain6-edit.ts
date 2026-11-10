import type { GameState } from '../types';
import type { EditTerrain6Command } from '../v6-edit-types';
import { planTerrain6Edit } from '../v6-edit-plan';
import { getV6EditSurface, resourceAfterV6Cut } from '../v6-edit-surface';
import { terrain6EditLevel } from '../v6-edit-level';
import { useDurability } from '../foundation';
import { requireRule } from '../guards';
/** Called only in the dispatch clone. Any plan/drop/durability failure returns the original state. */
export function editTerrain6(state: GameState, command: EditTerrain6Command): string[] {
  const plan = planTerrain6Edit(state, command),
    world = getV6EditSurface(state).world;
  if (command.kind === 'fill') {
    const amount = plan.cost[command.material];
    if (command.source.type === 'inventory') state.inventory[command.material] -= amount;
    else {
      const source = command.source.stack;
      const pile = state.groundStacks.find((p) => p.x === source.x && p.z === source.z)!;
      pile.amount -= amount;
      if (pile.amount === 0) state.groundStacks = state.groundStacks.filter((p) => p !== pile);
    }
  }
  state.terrain6!.cells = state
    .terrain6!.cells.filter((c) => c.x !== command.x || c.z !== command.z)
    .concat(plan.cell)
    .sort((a, b) => a.z - b.z || a.x - b.x);
  const resource = resourceAfterV6Cut(world, plan.cell);
  const oldIndex = state.naturalResources.findIndex((r) => r.x === command.x && r.z === command.z);
  if (oldIndex >= 0) {
    if (resource) state.naturalResources[oldIndex] = resource;
    else state.naturalResources.splice(oldIndex, 1);
  } else requireRule(!resource, '地形原生资源状态不一致');
  state.looseDrops = plan.drops;
  state.nextId = plan.nextId;
  useDurability(state, 'diggingTool');
  state.terrain6!.nextOperation++;
  return [command.kind === 'fill' ? '已用所选真实材料修平地块' : '开挖材料已落在附近，请手动拾取'];
}
/** Legacy UI resource selection is routed to the same v6 material authority, never old yields. */
export function gatherTerrain6(state: GameState, resourceId: string): string[] {
  const resource = state.naturalResources.find((r) => r.id === resourceId);
  requireRule(resource, '此处没有可采集的天然资源');
  const surface = getV6EditSurface(state);
  requireRule(
    surface.exposedResourceAt(resource.x, resource.z),
    '该天然资源已埋在填筑平台下，请按地块开挖',
  );
  const level = terrain6EditLevel(state, resource.x, resource.z, 'dig');
  requireRule(level !== null, '此处已到保护底面');
  return editTerrain6(state, {
    type: 'editTerrain6',
    kind: 'dig',
    x: resource.x,
    z: resource.z,
    level,
    expectedOperation: state.terrain6!.nextOperation,
  });
}
