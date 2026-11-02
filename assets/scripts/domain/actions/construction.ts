import type { GameState, Command, Building } from '../types';
import { CONFIG } from '../config';
import { requireRule } from '../guards';
import { find, spend, nextId, getCapacity, getUsedStorage } from '../state';
import { validatePlacement, adjacent } from '../geometry';
export function place(
  s: GameState,
  command: Extract<Command, { type: 'place' }>,
  _effectiveNow: number,
): string[] {
  const events: string[] = [];
  requireRule(['farm', 'warehouse', 'cooler'].includes(command.kind), '此建筑需通过改造解锁');
  const rotation = command.rotation ?? 0;
  requireRule(rotation === 0 || rotation === 1, '朝向无效');
  const b: Building = {
    id: nextId(s, 'b'),
    kind: command.kind,
    x: command.x,
    z: command.z,
    rotation,
  };
  validatePlacement(s, b);
  spend(s, CONFIG.buildings[b.kind].cost);
  s.buildings.push(b);
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
  const events: string[] = [];
  const warehouse = find(s, command.warehouseId),
    cooler = find(s, command.coolerId);
  requireRule(warehouse.kind === 'warehouse' && cooler.kind === 'cooler', '需要基础仓房与制冷设施');
  requireRule(adjacent(warehouse, cooler), '制冷设施必须与仓房边缘相邻');
  requireRule(!warehouse.job && !cooler.job, '生产中不能合体');
  spend(s, CONFIG.combineCost);
  warehouse.kind = 'coldWarehouse';
  s.buildings = s.buildings.filter((b) => b.id !== cooler.id);
  validatePlacement(s, warehouse);
  requireRule(getUsedStorage(s) <= getCapacity(s), '合体后容量不足');
  events.push('合体完成：冷藏库获得冷藏处理能力');
  return events;
}
