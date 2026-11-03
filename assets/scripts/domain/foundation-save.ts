import type { GameState, Tree, GroundStack } from './types';
import { isLandCell } from './island';
import { CONFIG } from './config';
import { ITEM_KEYS } from './crops';
import { TOOL_IDS, initialTools, initialToolRecovery, FOUNDATION } from './foundation';
import { requireRule, integer } from './guards';
function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
export function importFoundation(
  raw: Record<string, unknown>,
  legacy: boolean,
  gridLimit = CONFIG.gridSize,
  seed = 1,
): Pick<GameState, 'tools' | 'toolRecoveryAvailable' | 'trees' | 'nextTreeId' | 'groundStacks'> {
  const result = {
    tools: initialTools(),
    toolRecoveryAvailable: initialToolRecovery(),
    trees: [] as Tree[],
    nextTreeId: 1,
    groundStacks: [] as GroundStack[],
  };
  if (legacy) return result;
  requireRule(record(raw.tools) && record(raw.toolRecoveryAvailable), '工具记录无效');
  for (const tool of TOOL_IDS) {
    requireRule(
      integer(raw.tools[tool]) && typeof raw.toolRecoveryAvailable[tool] === 'boolean',
      '工具耐久或应急状态无效',
    );
    result.tools[tool] = raw.tools[tool] as number;
    result.toolRecoveryAvailable[tool] = raw.toolRecoveryAvailable[tool] as boolean;
  }
  requireRule(integer(raw.nextTreeId) && raw.nextTreeId >= 1, '树木编号无效');
  result.nextTreeId = raw.nextTreeId;
  requireRule(
    Array.isArray(raw.trees) &&
      raw.trees.length <= CONFIG.gridSize ** 2 &&
      Array.isArray(raw.groundStacks) &&
      raw.groundStacks.length <= CONFIG.gridSize ** 2,
    '地面记录无效',
  );
  const cells = new Set<string>(),
    ids = new Set<string>();
  function acceptCell(value: Record<string, unknown>): { x: number; z: number } {
    requireRule(integer(value.x, gridLimit - 1) && integer(value.z, gridLimit - 1), '地块位置无效');
    requireRule(isLandCell(value.x, value.z, seed), '地面物品不能位于水域');
    const key = `${value.x},${value.z}`;
    requireRule(!cells.has(key), '树木或地堆重叠');
    cells.add(key);
    return { x: value.x, z: value.z };
  }
  for (const value of raw.trees) {
    requireRule(
      record(value) &&
        typeof value.id === 'string' &&
        /^t[1-9][0-9]{0,8}$/.test(value.id) &&
        !ids.has(value.id) &&
        Number(value.id.slice(1)) < result.nextTreeId,
      '树木记录无效',
    );
    ids.add(value.id);
    result.trees.push({ id: value.id, ...acceptCell(value) });
  }
  for (const value of raw.groundStacks) {
    requireRule(
      record(value) &&
        ITEM_KEYS.includes(value.item as never) &&
        integer(value.amount, FOUNDATION.stackLimit) &&
        value.amount >= 1,
      '地堆产品或数量无效',
    );
    result.groundStacks.push({
      ...acceptCell(value),
      item: value.item as GroundStack['item'],
      amount: value.amount,
    });
  }
  return result;
}
