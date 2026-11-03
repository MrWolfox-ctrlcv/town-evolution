import type { GameState, Command } from './types';
import { CROP_KEYS, CROPS, isCrop } from './crops';
import { requireRule, integer } from './guards';
import { COMMERCE } from './commerce';
import { getCapacity, getUsedStorage, spend } from './state';
export function hasPlantingSource(s: GameState): boolean {
  return (
    s.groundStacks.some((pile) => CROP_KEYS.includes(pile.item as never) && pile.amount > 0) ||
    CROP_KEYS.some((crop) => s.inventory[crop] > 0) ||
    s.buildings.some((b) => b.kind === 'farm' && b.cropJobs?.some(Boolean)) ||
    Object.values(s.commerce.dockCargo).some((cargo) => CROP_KEYS.some((crop) => cargo[crop] > 0))
  );
}
export function recoverCrop(s: GameState): string[] {
  requireRule(
    s.cropRecoveryAvailable && s.coins < COMMERCE.prices.vegetable.buy && !hasPlantingSource(s),
    '仅无种苗且金币不足8时可领取一次应急种苗',
  );
  requireRule(getUsedStorage(s) < getCapacity(s), '请先腾出1格仓库空间');
  s.inventory.vegetable++;
  s.cropRecoveryAvailable = false;
  return ['已领取一次性应急种苗'];
}
export function buyCrop(s: GameState, c: Extract<Command, { type: 'buyCrop' }>): string[] {
  requireRule(isCrop(c.item) && integer(c.quantity) && c.quantity > 0, '购买作物或数量无效');
  requireRule(getUsedStorage(s) + c.quantity <= getCapacity(s), '仓库空间不足');
  spend(s, COMMERCE.prices[c.item].buy * c.quantity);
  s.inventory[c.item] += c.quantity;
  return [`购入${c.quantity}份${CROPS[c.item].label}`];
}
