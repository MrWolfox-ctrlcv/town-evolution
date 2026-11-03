import type { GameState, Command, Building } from '../types';
import { isDockShore } from '../island';
import { mergeAttachments } from '../fusion-state';
import { initializeFacility, hasTradeFacility } from '../commerce';
import { CONFIG } from '../config';
import { requireRule } from '../guards';
import { find, spend, nextId, getCapacity, getUsedStorage } from '../state';
import { validatePlacement, adjacent, preserveTradeTile } from '../geometry';
export function place(
  s: GameState,
  command: Extract<Command, { type: 'place' }>,
  _effectiveNow: number,
): string[] {
  const events: string[] = [];
  requireRule(
    ['farm', 'warehouse', 'cooler', 'shop', 'orderBoard', 'dock'].includes(command.kind),
    '此建筑需通过改造解锁',
  );
  const rotation = command.rotation ?? 0;
  requireRule([0, 1, 2, 3].includes(rotation), '朝向无效');
  const b: Building = {
    id: nextId(s, 'b'),
    kind: command.kind,
    x: command.x,
    z: command.z,
    rotation,
  };
  validatePlacement(s, b);
  if (b.kind === 'dock' && command.rotation === undefined) orientDock(b, s.mapSeed);
  validateShore(b, s.mapSeed);
  spend(s, CONFIG.buildings[b.kind].cost);
  if (b.kind === 'farm') b.cropJobs = Array(9).fill(null);
  s.buildings.push(b);
  initializeFacility(s.commerce, b);
  preserveTradeTile(s);
  events.push(`建造了${CONFIG.buildings[b.kind].label}`);
  return events;
}

export function upgrade(
  s: GameState,
  command: Extract<Command, { type: 'upgrade' }>,
  _effectiveNow: number,
): string[] {
  const events: string[] = [];
  const b = find(s, command.buildingId);
  requireRule(command.target === 'expandedWarehouse' && b.kind === 'warehouse', '此改造分支不可用');
  requireRule(!b.job, '生产中不能改造');
  spend(s, CONFIG.expansionCost);
  b.kind = 'expandedWarehouse';
  validatePlacement(s, b);
  requireRule(getUsedStorage(s) <= getCapacity(s), '改造后容量不足');
  events.push('仓房已扩容为双层仓库');
  return events;
}

export function combine(
  s: GameState,
  command: Extract<Command, { type: 'combine' }>,
  _effectiveNow: number,
): string[] {
  const warehouse = find(s, command.warehouseId),
    cooler = find(s, command.coolerId);
  requireRule(warehouse.kind === 'warehouse' && cooler.kind === 'cooler', '需要基础仓房与制冷设施');
  requireRule(adjacent(warehouse, cooler), '制冷设施必须与仓房边缘相邻');
  return mergeWarehouse(s, warehouse, cooler);
}

/** A drag is intent only: merge atomically at the warehouse without moving either input first. */
export function dragMerge(
  s: GameState,
  command: Extract<Command, { type: 'dragMerge' }>,
  _effectiveNow: number,
): string[] {
  const source = find(s, command.sourceId);
  const target = find(s, command.targetId);
  requireRule(source.id !== target.id, '不能与自身合体');
  const warehouse = source.kind === 'warehouse' ? source : target;
  const cooler = source.kind === 'cooler' ? source : target;
  requireRule(warehouse.kind === 'warehouse' && cooler.kind === 'cooler', '需要基础仓房与制冷设施');
  return mergeWarehouse(s, warehouse, cooler);
}

function mergeWarehouse(s: GameState, warehouse: Building, cooler: Building): string[] {
  requireRule(!warehouse.job && !cooler.job, '生产中不能合体');
  spend(s, CONFIG.combineCost);
  mergeAttachments(s, warehouse.id, cooler.id);
  warehouse.kind = 'coldWarehouse';
  s.buildings = s.buildings.filter((b) => b.id !== cooler.id);
  validatePlacement(s, warehouse);
  requireRule(getUsedStorage(s) <= getCapacity(s), '合体后容量不足');
  return ['合体完成：冷藏库。当前版本不开放新的冷藏生产'];
}

/** Explicit legacy-town recovery, never an automatic save migration. */
export function repurposeToBoard(
  s: GameState,
  command: Extract<Command, { type: 'repurposeToBoard' }>,
): string[] {
  requireRule(!hasTradeFacility(s), '已有交易设施，无需改建');
  const building = find(s, command.buildingId);
  requireRule(building.kind === 'cooler' || building.kind === 'farm', '仅空闲菜地或制冷设施可改建');
  requireRule(!building.job && !building.cropJobs?.some(Boolean), '请先完成并收获作物');
  requireRule(
    building.kind !== 'farm' || s.buildings.filter((b) => b.kind === 'farm').length > 1,
    '请保留至少一块菜地用于生产',
  );
  delete building.cropJobs;
  building.kind = 'orderBoard';
  validatePlacement(s, building);
  return ['已免费改为公共订单板'];
}

/** Move preserves production, commerce ownership and identity; no currency transaction. */
export function moveBuilding(
  s: GameState,
  c: Extract<Command, { type: 'moveBuilding' }>,
): string[] {
  const b = find(s, c.buildingId);
  b.x = c.x;
  b.z = c.z;
  validatePlacement(s, b);
  if (b.kind === 'dock') orientDock(b, s.mapSeed);
  validateShore(b, s.mapSeed);
  return ['已移动建筑'];
}

/** Orientation changes geometry only; jobs, ownership and receipts stay attached. */
export function rotateBuilding(
  s: GameState,
  c: Extract<Command, { type: 'rotateBuilding' }>,
): string[] {
  const b = find(s, c.buildingId);
  const original = b.rotation;
  if (b.kind === 'dock') {
    for (let step = 1; step < 4; step++) {
      b.rotation = ((original + step) % 4) as Building['rotation'];
      if (isDockShore(b, s.mapSeed)) {
        validatePlacement(s, b);
        return ['已转向建筑'];
      }
    }
    throw new Error('此处只有一个临海朝向，请长按移动到其他岸边');
  }
  b.rotation = ((original + 1) % 4) as Building['rotation'];
  validatePlacement(s, b);
  return ['已转向建筑'];
}

function orientDock(b: Building, seed: number): void {
  const initial = b.rotation;
  for (let step = 0; step < 4; step++) {
    b.rotation = ((initial + step) % 4) as Building['rotation'];
    if (isDockShore(b, seed)) return;
  }
  b.rotation = initial;
}

function validateShore(b: Building, seed: number): void {
  requireRule(b.kind !== 'dock' || isDockShore(b, seed), '船坞出口必须朝向海面');
}
