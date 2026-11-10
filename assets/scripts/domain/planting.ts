import type { GameState, Command } from './types';
import { CROP_KEYS, CROPS, isCrop } from './crops';
import { requireRule, integer } from './guards';
import { COMMERCE } from './commerce';
import { getCapacity, getUsedStorage, spend } from './state';
export function hasPlantingSource(s: GameState): boolean {
  return (
    s.looseDrops.some((drop) => isCrop(drop.item) && drop.amount > 0) ||
    s.buildings.some(
      (b) => b.collectionBox && CROP_KEYS.some((crop) => b.collectionBox!.stock[crop] > 0),
    ) ||
    // Waiting crops can be withdrawn; reserved batch inputs cannot become seeds again.
    s.buildings.some((b) => b.compost && CROP_KEYS.some((crop) => b.compost!.stock[crop] > 0)) ||
    s.groundStacks.some((pile) => CROP_KEYS.includes(pile.item as never) && pile.amount > 0) ||
    CROP_KEYS.some((crop) => s.inventory[crop] > 0) ||
    Object.values(s.fusion.attachments).some((stock) =>
      CROP_KEYS.some((crop) => stock[crop] > 0),
    ) ||
    s.buildings.some((b) => b.kind === 'farm' && b.cropJobs?.some(Boolean)) ||
    Object.values(s.commerce.dockCargo).some((cargo) => CROP_KEYS.some((crop) => cargo[crop] > 0))
  );
}
export function recoverCrop(s: GameState): string[] {
  requireRule(
    s.cropRecoveryAvailable && s.coins < COMMERCE.prices.vegetable.buy && !hasPlantingSource(s),
    '仅无种苗且金币不足8时可领取一次应急种苗',
  );
  const farms = s.buildings.filter((b) => b.kind === 'farm');
  requireRule(farms.length > 0, '请先开垦一块田地再领取适合的种苗');
  requireRule(getUsedStorage(s) + 1 <= getCapacity(s), '请先腾出1格仓库空间');
  const crop = farms.some((b) => !b.irrigated) ? 'vegetable' : 'rice';
  s.inventory[crop]++;
  s.cropRecoveryAvailable = false;
  return [`已领取一次性${CROPS[crop].label}种苗`];
}
export function buyCrop(s: GameState, c: Extract<Command, { type: 'buyCrop' }>): string[] {
  requireRule(isCrop(c.item) && integer(c.quantity) && c.quantity > 0, '购买作物或数量无效');
  requireRule(getUsedStorage(s) + c.quantity <= getCapacity(s), '仓库空间不足');
  requireRule(integer(CROPS[c.item].buy) && CROPS[c.item].buy > 0, '购买价格配置无效');
  spend(s, COMMERCE.prices[c.item].buy * c.quantity);
  s.inventory[c.item] += c.quantity;
  return [`购入${c.quantity}份${CROPS[c.item].label}`];
}
