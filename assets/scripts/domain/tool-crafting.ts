import type { Building, GameState } from './types';
import { MAX_VALUE } from './config';
import { integer } from './guards';
import { TOOL_CRAFT_RECIPES } from './craft-recipes';
import { footprint, preserveTradeTile, validatePlacement } from './geometry';
import { worldSize } from './world';
export interface ToolCraftPlan {
  building: Building | null;
  width: number;
  depth: number;
  reason: string | null;
}
/** Preview and commit use one plan. Every candidate includes the actual consumed pile cell. */
export function toolCraftPlan(
  state: GameState,
  tool: 'saw' | 'hammer',
  x: number,
  z: number,
): ToolCraftPlan {
  const invalid = (reason: string): ToolCraftPlan => ({
    building: null,
    width: 1,
    depth: 1,
    reason,
  });
  if (
    !integer(x, worldSize(state.terrainVersion) - 1) ||
    !integer(z, worldSize(state.terrainVersion) - 1)
  )
    return invalid('请选择地图内的地块');
  const pile = state.groundStacks.find((entry) => entry.x === x && entry.z === z);
  const recipe = TOOL_CRAFT_RECIPES.find(
    (entry) => entry.tool === tool && entry.item === pile?.item && entry.amount === pile.amount,
  );
  if (!recipe)
    return invalid(
      tool === 'saw'
        ? '锯子需要恰好3或4份木材，制作手推车或木船'
        : '锤子需要1木造公告牌、2木造箱子、3木造栈桥、4木造房屋、2石造石磨',
    );
  const original: Building = { id: `b${state.nextId}`, kind: recipe.kind, x, z, rotation: 0 };
  const size = footprint(original);
  if (state.nextId >= MAX_VALUE) return { building: original, ...size, reason: '编号达到上限' };
  const cleared = { ...state, groundStacks: state.groundStacks.filter((entry) => entry !== pile) };
  let reason: string | null = null;
  for (let dz = 0; dz < size.depth; dz++)
    for (let dx = 0; dx < size.width; dx++) {
      const building = { ...original, x: x - dx, z: z - dz };
      try {
        validatePlacement(cleared, building);
        preserveTradeTile({ ...cleared, buildings: [...cleared.buildings, building] });
        return { building, ...size, reason: null };
      } catch (error) {
        reason ??= error instanceof Error ? error.message : '此处无法放置';
      }
    }
  return { building: original, ...size, reason };
}
