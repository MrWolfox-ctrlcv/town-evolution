import type { GameState, Command, Building } from '../types';
import { isLandCell } from '../island';
import { CONFIG, MAX_VALUE } from '../config';
import { ITEM_KEYS } from '../crops';
import { FOUNDATION, useDurability } from '../foundation';
import { requireRule, integer } from '../guards';
import { footprint, validatePlacement, preserveTradeTile } from '../geometry';
import { getCapacity, getUsedStorage, nextId, spend, find } from '../state';
function tile(s: GameState, x: number, z: number): void {
  requireRule(
    integer(x, CONFIG.gridSize - 1) && integer(z, CONFIG.gridSize - 1),
    '请选择地图内的地块',
  );
  requireRule(isLandCell(x, z, s.mapSeed), '此处是水域');
  requireRule(!s.trees.some((t) => t.x === x && t.z === z), '此地块有树木');
  requireRule(
    !s.buildings.some((b) => {
      const d = footprint(b);
      return x >= b.x && x < b.x + d.width && z >= b.z && z < b.z + d.depth;
    }),
    '此地块有建筑',
  );
}
export function placeTree(s: GameState, c: Extract<Command, { type: 'placeTree' }>): string[] {
  tile(s, c.x, c.z);
  requireRule(!s.groundStacks.some((p) => p.x === c.x && p.z === c.z), '此地块堆有产品');
  requireRule(s.nextTreeId < MAX_VALUE, '树木编号达到上限');
  spend(s, FOUNDATION.treePrice);
  s.trees.push({ id: `t${s.nextTreeId++}`, x: c.x, z: c.z });
  preserveTradeTile(s);
  return ['已放置树木'];
}
export function transferGround(
  s: GameState,
  c: Extract<Command, { type: 'dropProduct' | 'pickupProduct' }>,
): string[] {
  tile(s, c.x, c.z);
  const amount = c.quantity ?? 1;
  requireRule(
    ITEM_KEYS.includes(c.item) && integer(amount, FOUNDATION.stackLimit) && amount > 0,
    '产品或数量无效',
  );
  const pile = s.groundStacks.find((p) => p.x === c.x && p.z === c.z);
  if (c.type === 'dropProduct') {
    requireRule(!pile || pile.item === c.item, '每格只能堆同一种产品');
    requireRule((pile?.amount ?? 0) + amount <= FOUNDATION.stackLimit, '每格最多堆5份');
    requireRule(s.inventory[c.item] >= amount, '库存不足');
    s.inventory[c.item] -= amount;
    if (pile) pile.amount += amount;
    else s.groundStacks.push({ x: c.x, z: c.z, item: c.item, amount });
    preserveTradeTile(s);
    return ['已叠放产品'];
  }
  requireRule(pile && pile.item === c.item && pile.amount >= amount, '地面产品不足');
  requireRule(getUsedStorage(s) + amount <= getCapacity(s), '仓库空间不足');
  pile.amount -= amount;
  s.inventory[c.item] += amount;
  if (pile.amount === 0) s.groundStacks = s.groundStacks.filter((p) => p !== pile);
  return ['已取回产品'];
}
export function applyTool(
  s: GameState,
  c: Extract<Command, { type: 'useTool'; tool: 'axe' | 'saw' }>,
): string[] {
  if (c.tool === 'axe') {
    const tree = s.trees.find((t) => t.id === c.treeId);
    requireRule(tree, '此处没有树木');
    requireRule(getUsedStorage(s) + FOUNDATION.treeYield <= getCapacity(s), '仓库空间不足');
    useDurability(s, 'axe');
    s.inventory.wood += FOUNDATION.treeYield;
    s.trees = s.trees.filter((t) => t !== tree);
    return ['获得1份木材，请从产品栏拖到地上叠放'];
  }
  requireRule(c.tool === 'saw', '此工具配方尚未开放');
  tile(s, c.x, c.z);
  const pile = s.groundStacks.find((p) => p.x === c.x && p.z === c.z);
  requireRule(
    pile?.item === 'wood' && pile.amount >= FOUNDATION.warehouseWood,
    '请在同一地块叠放至少3份木材',
  );
  const remainder = pile.amount - FOUNDATION.warehouseWood;
  const warehouse: Building = {
    id: nextId(s, 'b'),
    kind: 'warehouse',
    x: c.x,
    z: c.z,
    rotation: 0,
  };
  s.groundStacks = s.groundStacks.filter((p) => p !== pile);
  validatePlacement(s, warehouse);
  s.buildings.push(warehouse);
  preserveTradeTile(s);
  requireRule(getUsedStorage(s) + remainder <= getCapacity(s), '余料无法退回仓库');
  useDurability(s, 'saw');
  s.inventory.wood += remainder;
  return [remainder ? `建成仓库，${remainder}份余料已退回库存` : '已用3份木材建成仓库'];
}

/** Move the whole pile without routing through warehouse capacity. */
export function moveStack(s: GameState, c: Extract<Command, { type: 'moveStack' }>): string[] {
  tile(s, c.fromX, c.fromZ);
  tile(s, c.x, c.z);
  const source = s.groundStacks.find((p) => p.x === c.fromX && p.z === c.fromZ);
  requireRule(source, '此处没有产品堆');
  if (c.fromX === c.x && c.fromZ === c.z) return ['产品堆位置未变'];
  const target = s.groundStacks.find((p) => p.x === c.x && p.z === c.z);
  requireRule(!target || target.item === source.item, '每格只能堆同一种产品');
  if (target) {
    const transferred = Math.min(FOUNDATION.stackLimit - target.amount, source.amount);
    requireRule(transferred > 0, '目标产品堆已满');
    target.amount += transferred;
    source.amount -= transferred;
    if (source.amount === 0) s.groundStacks = s.groundStacks.filter((p) => p !== source);
    else return [`已叠放${transferred}份，余下${source.amount}份保留原地`];
  } else {
    source.x = c.x;
    source.z = c.z;
  }
  return ['已移动产品堆'];
}

/** Whole-pile recovery. Warehouses are entrances to the same shared inventory. */
export function pickupStack(s: GameState, c: Extract<Command, { type: 'pickupStack' }>): string[] {
  tile(s, c.x, c.z);
  const pile = s.groundStacks.find((p) => p.x === c.x && p.z === c.z);
  requireRule(pile, '此处没有产品堆');
  if (c.warehouseId !== undefined) {
    const warehouse = find(s, c.warehouseId);
    requireRule(
      ['warehouse', 'expandedWarehouse', 'coldWarehouse'].includes(warehouse.kind),
      '请拖到仓库或产品栏回收',
    );
  }
  requireRule(
    getUsedStorage(s) + pile.amount <= getCapacity(s),
    '仓库空间不足，整堆产品仍保留原地',
  );
  s.inventory[pile.item] += pile.amount;
  s.groundStacks = s.groundStacks.filter((p) => p !== pile);
  return ['已将整堆产品收回仓库'];
}
