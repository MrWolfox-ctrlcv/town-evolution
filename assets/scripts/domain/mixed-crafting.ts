import { validItemAmount } from './v6-material-amount';
export type { MixedCraftRequest } from './types';
import type { Building, GameState, MixedCraftRequest } from './types';
import { MAX_VALUE } from './config';
import { integer, requireRule } from './guards';
import { stackLimitFor } from './foundation';
import { preserveTradeTile, validatePlacement } from './geometry';
import { worldSize } from './world';
export interface MixedCraftPlan {
  building: Building | null;
  width: number;
  depth: number;
  reason: string | null;
}
/** Every input and placement check finishes before commit. One unit from each selected pile. */
export function mixedCraftPlan(state: GameState, request: MixedCraftRequest): MixedCraftPlan {
  const invalid = (reason: string): MixedCraftPlan => ({
    building: null,
    width: 1,
    depth: 1,
    reason,
  });
  try {
    requireRule(
      request?.recipeId === 'build-stone-oven' && request.tool === 'hammer',
      '此工具不能完成所选组合',
    );
    const size = worldSize(state.terrainVersion);
    requireRule(integer(request.x, size - 1) && integer(request.z, size - 1), '请选择地图内的落点');
    requireRule(
      Array.isArray(request.sources) && request.sources.length === 2,
      '请明确选择两处材料',
    );
    const keys = new Set<string>();
    const items = new Set<string>();
    for (const source of request.sources) {
      requireRule(
        source &&
          typeof source === 'object' &&
          integer(source.x, size - 1) &&
          integer(source.z, size - 1) &&
          (source.item === 'wood' || source.item === 'stone') &&
          validItemAmount(
            source.amount,
            source.item,
            state.terrainVersion,
            stackLimitFor(source.item),
          ) &&
          source.amount >= 1,
        '所选材料无效',
      );
      const key = `${source.x},${source.z}`;
      requireRule(!keys.has(key) && !items.has(source.item), '请明确选择不同材料来源');
      keys.add(key);
      items.add(source.item);
      const actual = state.groundStacks.find((p) => p.x === source.x && p.z === source.z);
      requireRule(
        actual?.item === source.item && actual.amount === source.amount,
        '所选材料已变化，请重新选择',
      );
    }
    requireRule(items.has('wood') && items.has('stone'), '所选材料尚不能组合');
    requireRule(state.nextId < MAX_VALUE, '编号达到上限');
    const building: Building = {
      id: `b${state.nextId}`,
      kind: 'stoneOven',
      x: request.x,
      z: request.z,
      rotation: 0,
    };
    const remaining = state.groundStacks.flatMap((p) =>
      keys.has(`${p.x},${p.z}`) ? (p.amount === 1 ? [] : [{ ...p, amount: p.amount - 1 }]) : [p],
    );
    const cleared = { ...state, groundStacks: remaining };
    validatePlacement(cleared, building);
    preserveTradeTile({ ...cleared, buildings: [...cleared.buildings, building] });
    return { building, width: 1, depth: 1, reason: null };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : '所选组合不可用');
  }
}
