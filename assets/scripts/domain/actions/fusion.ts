import type { GameState, Command } from '../types';
import { emptyStock, stockTotal } from '../commerce';
import { ITEM_KEYS } from '../crops';
import { requireRule, integer } from '../guards';
import { find, getCapacity, getUsedStorage } from '../state';
import { useDurability } from '../foundation';
import { FUSION } from '../recipes';
export function transferMaterial(
  s: GameState,
  c: Extract<Command, { type: 'attachMaterial' | 'detachMaterial' }>,
): string[] {
  find(s, c.buildingId);
  requireRule(
    ITEM_KEYS.includes(c.item) && integer(c.quantity, FUSION.attachmentLimit) && c.quantity > 0,
    '材料或数量无效',
  );
  const stock = s.fusion.attachments[c.buildingId] ?? emptyStock();
  if (c.type === 'attachMaterial') {
    requireRule(s.inventory[c.item] >= c.quantity, '库存材料不足');
    requireRule(
      stockTotal(stock) + c.quantity <= FUSION.attachmentLimit,
      '每座建筑最多挂载5份材料',
    );
    s.inventory[c.item] -= c.quantity;
    stock[c.item] += c.quantity;
    s.fusion.attachments[c.buildingId] = stock;
    return ['材料已放在建筑上，可以继续添加或取回'];
  }
  requireRule(stock[c.item] >= c.quantity, '建筑上的材料不足');
  requireRule(getUsedStorage(s) + c.quantity <= getCapacity(s), '仓库空间不足，材料仍保留在建筑上');
  stock[c.item] -= c.quantity;
  s.inventory[c.item] += c.quantity;
  if (stockTotal(stock) === 0) delete s.fusion.attachments[c.buildingId];
  return ['已取回建筑上的材料'];
}
export function hammerBuilding(s: GameState, id: string): string[] {
  const building = find(s, id);
  requireRule(building.kind === 'warehouse', '试试把材料叠在基础仓房上，再使用锤子');
  const stock = s.fusion.attachments[id];
  requireRule(
    stock && stock.wood >= FUSION.expansionWood,
    `基础仓房上还需要${Math.max(0, FUSION.expansionWood - (stock?.wood ?? 0))}份木材`,
  );
  requireRule(!building.job, '请先领取建筑中的生产任务');
  useDurability(s, 'hammer');
  stock.wood -= FUSION.expansionWood;
  building.kind = 'expandedWarehouse';
  if (stockTotal(stock) === 0) delete s.fusion.attachments[id];
  return ['融合成功：基础仓房扩建为双层仓房'];
}
