import { buildingMergePlan } from '../merge-plan';
import type { TerrainVersion } from '../world';
import type { GameState, Command, Building, LandCell } from '../types';
import { isDockShore } from '../island';
import { hasDockExit } from '../merge-plan';
import { blocksDockWater } from '../expansion';
import { mergeFarms } from './farming';
import { mergeAttachments } from '../fusion-state';
import { hasTradeFacility, initializeFacility } from '../commerce';
import { canMergeBuildings } from '../recipes';
import { CONFIG } from '../config';
import { requireRule } from '../guards';
import { find, spend, getCapacity, getUsedStorage } from '../state';
import { validatePlacement, adjacent } from '../geometry';
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
  requireRule(canMergeBuildings(source.kind, target.kind), '此组合没有可用配方');
  if (source.kind === 'farm' && target.kind === 'farm') return mergeFarms(s, source.id, target.id);
  if (source.kind === 'house' || target.kind === 'house' || source.kind === 'woodenPier') {
    if (source.kind === 'woodenPier')
      requireRule(Array.isArray(command.sources), '请重新明确选择两座栈桥');
    const plan = buildingMergePlan(s, source.id, target.id, command.sources);
    mergeAttachments(s, plan.retainedId, plan.consumedId);
    s.buildings = s.buildings
      .filter((b) => b.id !== plan.consumedId)
      .map((b) => (b.id === plan.retainedId ? plan.building : b));
    initializeFacility(s.commerce, plan.building);
    return [`合成完成：${CONFIG.buildings[plan.building.kind].label}`];
  }
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
  requireRule(!building.collectionBox, '带收获箱的田地不能改建');
  requireRule(!building.job && !building.cropJobs?.some(Boolean), '请先完成并收获作物');
  requireRule(
    building.kind !== 'farm' || s.buildings.filter((b) => b.kind === 'farm').length > 1,
    '请保留至少一块菜地用于生产',
  );
  delete building.cropJobs;
  delete building.farmSize;
  delete building.irrigated;
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
  if (b.kind === 'woodenBridge' || c.source !== undefined) {
    const source = c.source;
    requireRule(
      source &&
        source.id === b.id &&
        source.kind === b.kind &&
        source.x === b.x &&
        source.z === b.z &&
        source.rotation === b.rotation,
      '建筑起点已变化，请重新拖动',
    );
  }
  b.x = c.x;
  b.z = c.z;
  validatePlacement(s, b);
  if (b.kind === 'dock') orientDock(b, s.mapSeed, s.terrainVersion, s.landExtensions);
  validateShore(b, s.mapSeed, s.terrainVersion, s.landExtensions);
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
      if (
        dockExit(b, s.mapSeed, s.terrainVersion, s.landExtensions) &&
        !s.landExtensions.some((p) => blocksDockWater(p, [b]))
      ) {
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

function orientDock(
  b: Building,
  seed: number,
  version: TerrainVersion,
  landExtensions: readonly LandCell[],
): void {
  const initial = b.rotation;
  for (let step = 0; step < 4; step++) {
    b.rotation = ((initial + step) % 4) as Building['rotation'];
    if (
      dockExit(b, seed, version, landExtensions) &&
      !landExtensions.some((p) => blocksDockWater(p, [b]))
    )
      return;
  }
  b.rotation = initial;
}

function validateShore(
  b: Building,
  seed: number,
  version: TerrainVersion,
  landExtensions: readonly LandCell[],
): void {
  requireRule(
    b.kind !== 'dock' ||
      (dockExit(b, seed, version, landExtensions) &&
        !landExtensions.some((p) => blocksDockWater(p, [b]))),
    '船坞出口必须朝向海面',
  );
}

function dockExit(
  b: Building,
  seed: number,
  version: TerrainVersion,
  extensions: readonly LandCell[],
): boolean {
  return b.dockStyle === 'simple'
    ? hasDockExit({ mapSeed: seed, terrainVersion: version, landExtensions: [...extensions] }, b)
    : isDockShore(b, seed, version, extensions);
}
