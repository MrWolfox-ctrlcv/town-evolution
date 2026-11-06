import { createCompostState } from '../compost';
import { validatePlacement } from '../geometry';
import { worldSize } from '../world';
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
    const source = c.source;
    const pile = source
      ? s.groundStacks.find((p) => p.x === source.x && p.z === source.z)
      : undefined;
    if (source !== undefined)
      requireRule(
        source &&
          integer(source.x, worldSize(s.terrainVersion) - 1) &&
          integer(source.z, worldSize(s.terrainVersion) - 1) &&
          source.item === c.item &&
          pile?.item === c.item &&
          pile.amount === source.amount &&
          pile.amount >= c.quantity,
        '所选地面材料已变化',
      );
    else requireRule(s.inventory[c.item] >= c.quantity, '库存材料不足');
    requireRule(
      stockTotal(stock) + c.quantity <= FUSION.attachmentLimit,
      '每座建筑最多挂载5份材料',
    );
    if (pile) {
      pile.amount -= c.quantity;
      if (pile.amount === 0) s.groundStacks = s.groundStacks.filter((p) => p !== pile);
    } else s.inventory[c.item] -= c.quantity;
    stock[c.item] += c.quantity;
    s.fusion.attachments[c.buildingId] = stock;
    return ['材料已放在建筑上，可以继续添加或取回'];
  }
  requireRule(c.source === undefined, '取回挂载物品不能指定地面来源');
  requireRule(stock[c.item] >= c.quantity, '建筑上的材料不足');
  requireRule(getUsedStorage(s) + c.quantity <= getCapacity(s), '仓库空间不足，材料仍保留在建筑上');
  stock[c.item] -= c.quantity;
  s.inventory[c.item] += c.quantity;
  if (stockTotal(stock) === 0) delete s.fusion.attachments[c.buildingId];
  return ['已取回建筑上的材料'];
}
export function hammerBuilding(s: GameState, id: string): string[] {
  const building = find(s, id);
  if (building.kind === 'crate' && !s.fusion.attachments[id]?.mud) {
    const stock = s.fusion.attachments[id];
    requireRule(!stock || stockTotal(stock) === 0, '请先取回箱子上的材料，再锤成木桶');
    requireRule(!building.job && !building.processingJob, '请先完成当前生产');
    const compost = createCompostState();
    validatePlacement(s, { ...building, kind: 'compostBarrel' });
    useDurability(s, 'hammer');
    building.kind = 'compostBarrel';
    building.compost = compost;
    delete s.fusion.attachments[id];
    return ['已合成堆肥木桶，可放入作物或树种'];
  }
  if (building.kind === 'house' || building.kind === 'crate') {
    const stock = s.fusion.attachments[id];
    requireRule(stock && stock.mud >= 1, '请先把泥放在目标上，再使用锤子');
    requireRule(!building.job && !building.processingJob, '请先完成当前生产');
    const kind = building.kind === 'house' ? 'residence' : 'nursery';
    validatePlacement(s, { ...building, kind });
    useDurability(s, 'hammer');
    stock.mud--;
    building.kind = kind;
    if (stockTotal(stock) === 0) delete s.fusion.attachments[id];
    return [kind === 'nursery' ? '已合成育苗箱，请放入树种' : '已合成住宅'];
  }
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
