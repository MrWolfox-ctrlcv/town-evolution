import { validItemAmount } from '../v6-material-amount';
import { assertGroundCell as tile } from '../ground-placement';
import { planLooseDrops } from '../loose-drops';
import type { GameState, Command } from '../types';
import { CONFIG, MAX_VALUE } from '../config';
import { ITEM_KEYS } from '../crops';
import { FOUNDATION, useDurability, stackLimitFor } from '../foundation';
import { toolCraftPlan } from '../tool-crafting';
import { isTreeMature } from '../nursery';
import { requireRule } from '../guards';
import { preserveTradeTile } from '../geometry';
import { getCapacity, getUsedStorage, nextId, spend, find } from '../state';
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
    ITEM_KEYS.includes(c.item) &&
      validItemAmount(amount, c.item, s.terrainVersion, stackLimitFor(c.item)) &&
      amount > 0,
    '产品或数量无效',
  );
  const pile = s.groundStacks.find((p) => p.x === c.x && p.z === c.z);
  if (c.type === 'dropProduct') {
    requireRule(!pile || pile.item === c.item, '每格只能堆同一种产品');
    requireRule(
      (pile?.amount ?? 0) + amount <= stackLimitFor(c.item),
      `此产品每格最多堆${stackLimitFor(c.item)}份`,
    );
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
  now: number,
): string[] {
  if (c.tool === 'axe') {
    const tree = s.trees.find((t) => t.id === c.treeId);
    requireRule(tree, '此处没有树木');
    requireRule(isTreeMature(tree, now), '树苗尚未长成树木');
    requireRule(
      getUsedStorage(s) + FOUNDATION.treeYield + FOUNDATION.treeSeedYield <= getCapacity(s),
      '仓库需留出4份空间，木材和树种将一起收获',
    );
    useDurability(s, 'axe');
    s.inventory.wood += FOUNDATION.treeYield;
    s.inventory.treeSeed += FOUNDATION.treeSeedYield;
    s.trees = s.trees.filter((t) => t !== tree);
    return ['获得2份木材和2份树种，请从产品栏拖到地上叠放'];
  }
  return craftGroundTool(s, c);
}
export function craftGroundTool(
  s: GameState,
  c: Extract<Command, { type: 'useTool'; tool: 'saw' | 'hammer'; x: number }>,
): string[] {
  const plan = toolCraftPlan(s, c.tool, c.x, c.z);
  requireRule(!plan.reason && plan.building, plan.reason ?? '此处无法放置');
  const pile = s.groundStacks.find((p) => p.x === c.x && p.z === c.z)!;
  const amount = pile.amount;
  const building = { ...plan.building, id: nextId(s, 'b') };
  s.groundStacks = s.groundStacks.filter((p) => p !== pile);
  s.buildings.push(building);
  useDurability(s, c.tool);
  return [`已用${amount}份木材制成${CONFIG.buildings[building.kind].label}`];
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
    const transferred = Math.min(stackLimitFor(source.item) - target.amount, source.amount);
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
      ['warehouse', 'expandedWarehouse', 'coldWarehouse', 'transportWarehouse'].includes(
        warehouse.kind,
      ),
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

/** Digging clears a soil mound for nine soil; rock columns yield one stone cube per action. */
export function gatherNatural(
  s: GameState,
  c: Extract<Command, { type: 'gatherNatural' }>,
): string[] {
  const resource = s.naturalResources.find((p) => p.id === c.resourceId);
  requireRule(resource, '此处没有可采集的天然资源');
  const amount = resource.kind === 'soil' ? 9 : 1;
  const plan = planLooseDrops(
    s,
    resource.kind,
    amount,
    { x6: resource.x * 6 + 3, z6: resource.z * 6 + 3 },
    { type: 'natural', resourceId: resource.id, kind: resource.kind },
  );
  useDurability(s, 'diggingTool');
  s.looseDrops = plan.drops;
  s.nextId = plan.nextId;
  resource.amount -= resource.kind === 'soil' ? resource.amount : 1;
  if (resource.amount === 0) s.naturalResources = s.naturalResources.filter((p) => p !== resource);
  return [`${amount}份${resource.kind === 'soil' ? '土料' : '石料'}已落在附近，请手动拾取`];
}
