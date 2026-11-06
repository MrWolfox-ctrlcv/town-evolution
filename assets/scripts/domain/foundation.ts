import { isCrop } from './crops';
import type { ToolId, ToolState, GameState, Item } from './types';
import { requireRule, integer } from './guards';
export const TOOL_IDS: ToolId[] = [
  'sickle',
  'wateringCan',
  'fertilizer',
  'hammer',
  'saw',
  'axe',
  'diggingTool',
];
export const ACTIVE_TOOLS: ToolId[] = [
  'sickle',
  'saw',
  'axe',
  'hammer',
  'diggingTool',
  'wateringCan',
];
// Temporary gameplay policy, not a persisted resource value. Keep finite save data intact.
export const UNLIMITED_TOOL_DURABILITY = true;
export const TOOLS: Record<ToolId, { label: string; consumable: 'durability' | 'quantity' }> = {
  sickle: { label: '镰刀', consumable: 'durability' },
  wateringCan: { label: '水壶', consumable: 'durability' },
  fertilizer: { label: '肥料', consumable: 'quantity' },
  hammer: { label: '锤子', consumable: 'durability' },
  saw: { label: '锯子', consumable: 'durability' },
  axe: { label: '斧子', consumable: 'durability' },
  diggingTool: { label: '挖掘工具', consumable: 'durability' },
};
export function hasUnlimitedDurability(tool: ToolId): boolean {
  return UNLIMITED_TOOL_DURABILITY && TOOLS[tool].consumable === 'durability';
}
export const FOUNDATION = {
  toolPrice: 10,
  toolRefill: 10,
  sickleRefill: 90,
  treePrice: 5,
  treeYield: 2,
  treeSeedYield: 2,
  stackLimit: 5,
};
export function initialTools(): ToolState {
  return {
    sickle: 90,
    wateringCan: 10,
    fertilizer: 5,
    hammer: 10,
    saw: 10,
    axe: 10,
    diggingTool: 10,
  };
}
export function initialToolRecovery(): Record<ToolId, boolean> {
  return {
    sickle: true,
    wateringCan: false,
    fertilizer: false,
    hammer: false,
    saw: true,
    axe: true,
    diggingTool: false,
  };
}
export function useDurability(s: GameState, tool: ToolId): void {
  requireRule(ACTIVE_TOOLS.includes(tool), '此工具用途尚未开放');
  if (hasUnlimitedDurability(tool)) return;
  requireRule(s.tools[tool] >= 1, `${TOOLS[tool].label}已耗尽，请补充工具`);
  s.tools[tool]--;
}
export function replenishTool(s: GameState, tool: ToolId, emergency: boolean): string[] {
  requireRule(ACTIVE_TOOLS.includes(tool), '此工具暂不出售');
  requireRule(!hasUnlimitedDurability(tool), '工具当前为无限耐久，无需补给');
  if (emergency) {
    requireRule(
      s.toolRecoveryAvailable[tool] && s.tools[tool] === 0 && s.coins < FOUNDATION.toolPrice,
      '仅工具耗尽且金币不足时可领取一次应急工具',
    );
    s.toolRecoveryAvailable[tool] = false;
  } else {
    requireRule(s.coins >= FOUNDATION.toolPrice, '金币不足');
    s.coins -= FOUNDATION.toolPrice;
  }
  const amount = toolRefill(tool);
  requireRule(integer(s.tools[tool] + amount), '工具数量达到上限');
  s.tools[tool] += amount;
  return [`已补充${TOOLS[tool].label} ${amount}耐久`];
}

export function toolRefill(tool: ToolId): number {
  return tool === 'sickle' ? FOUNDATION.sickleRefill : FOUNDATION.toolRefill;
}

/** Ground capacity is independent of the five-unit building attachment limit. */
export function stackLimitFor(item: Item): number {
  if (item === 'wood' || item === 'stone') return 6;
  if (item === 'mud') return 9;
  if (isCrop(item)) return 10;
  return FOUNDATION.stackLimit;
}
