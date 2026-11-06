import type { GameState, LooseDrop } from './types';
import type { EditTerrain6Command, V6CellCheckpoint, V6MaterialSource } from './v6-edit-types';
import { V6_MATERIAL_QUANTA as Q } from './v6-edit-types';
import { getV6EditSurface, resourceAfterV6Cut } from './v6-edit-surface';
import { planLooseDrops } from './loose-drops';
import { hasUnlimitedDurability } from './foundation';
import {
  fillLayerQuanta,
  retainedLayerQuanta,
  v6EditPlane as plane,
  V6_EDIT_MAX_LEVEL,
} from './v6-material-volume';
import { materialAmount, isV6Material } from './v6-material-amount';
import { buildingOccupiesCell } from './building-cells';
import { integer, requireRule } from './guards';
import { MAX_VALUE } from './config';
export interface V6EditPlan {
  cell: V6CellCheckpoint;
  cost: { soil: number; stone: number };
  yield: { soil: number; stone: number };
  height: number;
  drops: LooseDrop[];
  nextId: number;
}
function exact(value: object, keys: string[]): void {
  requireRule(Object.keys(value).sort().join() === keys.sort().join(), '地形操作字段无效');
}
export function validateV6MaterialSource(
  state: GameState,
  source: V6MaterialSource,
  material: 'soil' | 'stone',
  amount: number,
): void {
  requireRule(source && typeof source === 'object', '请选择明确填土材料来源');
  if (source.type === 'inventory') {
    exact(source, ['type', 'item', 'amount']);
    requireRule(
      source.item === material &&
        materialAmount(source.amount) &&
        state.inventory[material] === source.amount &&
        source.amount >= amount,
      '所选库存材料已变化或数量不足',
    );
  } else {
    requireRule(
      source.type === 'ground' && source.stack && typeof source.stack === 'object',
      '填土材料来源无效',
    );
    exact(source, ['type', 'stack']);
    exact(source.stack, ['x', 'z', 'item', 'amount']);
    const p = state.groundStacks.find((v) => v.x === source.stack.x && v.z === source.stack.z);
    requireRule(
      p &&
        p.item === material &&
        p.item === source.stack.item &&
        materialAmount(source.stack.amount) &&
        p.amount === source.stack.amount &&
        p.amount >= amount,
      '所选地堆材料已变化或数量不足',
    );
  }
}
export function planTerrain6Edit(state: GameState, command: EditTerrain6Command): V6EditPlan {
  requireRule(
    command && typeof command === 'object' && command.type === 'editTerrain6',
    '地形操作无效',
  );
  exact(
    command,
    command.kind === 'dig'
      ? ['type', 'kind', 'x', 'z', 'level', 'expectedOperation']
      : ['type', 'kind', 'x', 'z', 'level', 'expectedOperation', 'material', 'source'],
  );
  const surface = getV6EditSurface(state),
    world = surface.world;
  requireRule(
    integer(command.x, world.size - 1) &&
      integer(command.z, world.size - 1) &&
      integer(command.level, V6_EDIT_MAX_LEVEL),
    '地形网格或层级无效',
  );
  requireRule(
    integer(command.expectedOperation) &&
      command.expectedOperation === state.terrain6!.nextOperation &&
      command.expectedOperation < MAX_VALUE,
    '地形已变化，请重新选择',
  );
  const { x, z, level } = command;
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const c = world.at(x + dx, z + dz),
        h = world.hydrology.at(x + dx, z + dz);
      requireRule(
        c && !c.reserved && h?.state === 'dryBuildable' && h.dryLower >= 1.8,
        '水域、岸边和保留地缓冲区不可改造',
      );
    }
  requireRule(!state.landExtensions.some((p) => p.x === x && p.z === z), '海上扩地不适用内陆挖填');
  requireRule(!state.trees.some((p) => p.x === x && p.z === z), '请先移除地块上的树木');
  requireRule(!state.buildings.some((b) => buildingOccupiesCell(b, x, z)), '请先移走建筑或田地');
  requireRule(
    !state.groundStacks.some((p) => p.x === x && p.z === z) &&
      !state.looseDrops.some((p) => Math.floor(p.x6 / 6) === x && Math.floor(p.z6 / 6) === z),
    '请先移走地堆或拾取掉落物',
  );
  const previous = surface.checkpointAt(x, z);
  const cell: V6CellCheckpoint = previous
    ? { ...previous, fills: previous.fills.map((f) => ({ ...f })) }
    : {
        x,
        z,
        initialResourceAmount: surface.resourceAt(x, z)?.amount ?? 0,
        cutLevel: null,
        level,
        fills: [],
      };
  const [lo, hi] = surface.range(x, z),
    target = plane(level);
  const output = { soil: 0, stone: 0 },
    cost = { soil: 0, stone: 0 };
  if (command.kind === 'dig') {
    requireRule(target < hi && target <= lo, '开挖平面必须低于整个原地块，不能暗中填高低角');
    for (let l = level + 1; l <= V6_EDIT_MAX_LEVEL; l++) {
      const q = retainedLayerQuanta(world, cell, l);
      output.soil += q.soil / Q;
      output.stone += q.stone / Q;
    }
    for (const fill of cell.fills)
      if (fill.level > level) output[fill.material] += fillLayerQuanta(world, cell, fill.level) / Q;
    cell.cutLevel = Math.min(cell.cutLevel ?? V6_EDIT_MAX_LEVEL, level);
    cell.fills = cell.fills.filter((f) => f.level <= level);
    requireRule(output.soil + output.stone > 0, '此层没有可挖材料');
  } else {
    requireRule(command.kind === 'fill' && isV6Material(command.material), '填土材料无效');
    requireRule(target >= hi && target > lo, '填筑平面必须覆盖整个原地块，不能暗中削低高角');
    const existing = new Set(cell.fills.map((f) => f.level));
    for (let l = 1; l <= level; l++) {
      if (existing.has(l)) continue;
      const amount = fillLayerQuanta(world, cell, l) / Q;
      if (amount > 0) {
        cell.fills.push({ level: l, material: command.material });
        cost[command.material] += amount;
      }
    }
    requireRule(cost[command.material] > 0, '此地块没有需要填补的体积');
    validateV6MaterialSource(state, command.source, command.material, cost[command.material]);
  }
  requireRule(
    hasUnlimitedDurability('diggingTool') || state.tools.diggingTool >= 1,
    '挖掘工具已耗尽',
  );
  cell.level = level;
  cell.fills.sort((a, b) => a.level - b.level);
  const resource = resourceAfterV6Cut(world, cell);
  const proposed = {
    ...state,
    terrain6: {
      ...state.terrain6!,
      cells: state.terrain6!.cells.filter((c) => c.x !== x || c.z !== z).concat(cell),
    },
    naturalResources: state.naturalResources
      .filter((r) => r.x !== x || r.z !== z)
      .concat(resource ? [resource] : []),
  };
  for (const item of ['soil', 'stone'] as const)
    if (output[item] > 0) {
      const plan = planLooseDrops(
        proposed,
        item,
        output[item],
        { x6: x * 6 + 3, z6: z * 6 + 3 },
        { type: 'terrain6', x, z, operation: command.expectedOperation, kind: item },
      );
      proposed.looseDrops = plan.drops;
      proposed.nextId = plan.nextId;
    }
  return {
    cell,
    cost,
    yield: output,
    height: target,
    drops: proposed.looseDrops,
    nextId: proposed.nextId,
  };
}
export function previewTerrain6Edit(state: GameState, command: EditTerrain6Command) {
  try {
    const plan = planTerrain6Edit(state, command);
    return {
      allowed: true as const,
      reason: '',
      cell: plan.cell,
      cost: plan.cost,
      yield: plan.yield,
      height: plan.height,
    };
  } catch (error) {
    return {
      allowed: false as const,
      reason: error instanceof Error ? error.message : '此处不能改造',
      cost: { soil: 0, stone: 0 },
      yield: { soil: 0, stone: 0 },
      height: null,
    };
  }
}
