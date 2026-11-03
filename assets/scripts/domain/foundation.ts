import type { ToolId, ToolState, GameState } from './types';
import { requireRule, integer } from './guards';
export const TOOL_IDS: ToolId[] = ['sickle', 'wateringCan', 'fertilizer', 'hammer', 'saw', 'axe'];
export const ACTIVE_TOOLS: ToolId[] = ['sickle', 'saw', 'axe'];
export const TOOLS: Record<ToolId, { label: string; consumable: 'durability' | 'quantity' }> = {
  sickle: { label: '镰刀', consumable: 'durability' },
  wateringCan: { label: '水壶', consumable: 'durability' },
  fertilizer: { label: '肥料', consumable: 'quantity' },
  hammer: { label: '锤子', consumable: 'durability' },
  saw: { label: '锯子', consumable: 'durability' },
  axe: { label: '斧子', consumable: 'durability' },
};
export const FOUNDATION = {
  toolPrice: 10,
  toolRefill: 10,
  sickleRefill: 90,
  treePrice: 5,
  treeYield: 1,
  stackLimit: 5,
  warehouseWood: 3,
};
export function initialTools(): ToolState {
  return { sickle: 90, wateringCan: 10, fertilizer: 5, hammer: 10, saw: 10, axe: 10 };
}
export function initialToolRecovery(): Record<ToolId, boolean> {
  return {
    sickle: true,
    wateringCan: false,
    fertilizer: false,
    hammer: false,
    saw: true,
    axe: true,
  };
}
export function useDurability(s: GameState, tool: ToolId): void {
  requireRule(ACTIVE_TOOLS.includes(tool), '此工具用途尚未开放');
  requireRule(s.tools[tool] >= 1, `${TOOLS[tool].label}已耗尽，请补充工具`);
  s.tools[tool]--;
}
export function replenishTool(s: GameState, tool: ToolId, emergency: boolean): string[] {
  requireRule(ACTIVE_TOOLS.includes(tool), '此工具暂不出售');
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
