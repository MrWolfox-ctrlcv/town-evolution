import type { GameState, Building, BuildingKind, Job } from './types';
import { importFoundation } from './foundation-save';
import { isCrop } from './crops';
import { importCommerce } from './commerce-save';
import { CONFIG, MAX_TIME } from './config';
import { requireRule, integer, time } from './guards';
import { advance, getCapacity, getUsedStorage } from './state';
import { validatePlacement } from './geometry';
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export class SaveVersionError extends Error {}
/** Current-world imports are strict. Authorized old-test clearing belongs to the storage adapter. */
export function importSave(text: string, now: number): GameState {
  time(now);
  requireRule(typeof text === 'string' && text.length <= 200_000, '存档过大或格式无效');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('存档不是有效 JSON');
  }
  requireRule(record(data), '存档结构无效');
  if (data.schemaVersion !== 8) throw new SaveVersionError('不支持此存档版本，请保留备份');
  requireRule(integer(data.mapSeed) && data.mapSeed > 0, '地图种子无效');
  requireRule(
    integer(data.coins) &&
      integer(data.nextId) &&
      data.nextId >= 1 &&
      integer(data.completedOrders),
    '存档数值无效',
  );
  requireRule(integer(data.lastSeenAt, MAX_TIME), '存档时间无效');
  requireRule(
    record(data.inventory) &&
      integer(data.inventory.vegetable) &&
      integer(data.inventory.wheat) &&
      integer(data.inventory.lettuce) &&
      integer(data.inventory.chilledVegetable) &&
      integer(data.inventory.wood) &&
      integer(data.inventory.stone),
    '产品库存无效',
  );
  requireRule(typeof data.cropRecoveryAvailable === 'boolean', '种苗恢复状态无效');
  requireRule(
    Array.isArray(data.buildings) && data.buildings.length <= CONFIG.gridSize ** 2,
    '建筑列表无效',
  );
  const buildings: Building[] = [],
    ids = new Set<string>();
  const savedTime = data.lastSeenAt;
  let maxId = 0;
  function acceptId(id: unknown, prefix: string): string {
    requireRule(
      typeof id === 'string' && new RegExp(`^${prefix}[1-9][0-9]{0,8}$`).test(id) && !ids.has(id),
      '建筑或任务编号无效',
    );
    ids.add(id);
    maxId = Math.max(maxId, Number(id.slice(1)));
    return id;
  }
  function parseJob(value: unknown, duration: number): Job {
    requireRule(
      record(value) && integer(value.startedAt, MAX_TIME) && integer(value.readyAt, MAX_TIME),
      '生产时间无效',
    );
    requireRule(
      value.startedAt <= savedTime && value.readyAt - value.startedAt === duration,
      '生产任务时间不一致',
    );
    return { id: acceptId(value.id, 'j'), startedAt: value.startedAt, readyAt: value.readyAt };
  }
  for (const raw of data.buildings) {
    requireRule(record(raw), '建筑记录无效');
    requireRule(
      typeof raw.kind === 'string' &&
        Object.prototype.hasOwnProperty.call(CONFIG.buildings, raw.kind),
      '未知建筑类型',
    );
    requireRule(
      integer(raw.x, CONFIG.gridSize) &&
        integer(raw.z, CONFIG.gridSize) &&
        (raw.rotation === 0 || raw.rotation === 1 || raw.rotation === 2 || raw.rotation === 3),
      '建筑位置无效',
    );
    const b: Building = {
      id: acceptId(raw.id, 'b'),
      kind: raw.kind as BuildingKind,
      x: raw.x,
      z: raw.z,
      rotation: raw.rotation,
    };
    if (b.kind === 'farm') {
      requireRule(
        raw.job === undefined && Array.isArray(raw.cropJobs) && raw.cropJobs.length === 9,
        '菜地应有9个独立小格',
      );
      b.cropJobs = raw.cropJobs.map((value) => {
        if (value === null) return null;
        const job = parseJob(value, CONFIG.cropDurationMs);
        requireRule(record(value) && isCrop(value.crop), '作物类型无效');
        return { ...job, crop: value.crop };
      });
    } else {
      requireRule(raw.cropJobs === undefined, '此建筑不应有菜地小格');
      if (raw.job !== undefined) {
        requireRule(b.kind === 'coldWarehouse', '此建筑不应有生产任务');
        b.job = parseJob(raw.job, CONFIG.coldDurationMs);
      }
    }
    buildings.push(b);
  }
  requireRule(data.nextId > maxId, '存档编号顺序无效');
  const state: GameState = {
    schemaVersion: 8,
    mapSeed: data.mapSeed,
    ...importFoundation(data, false, CONFIG.gridSize, data.mapSeed),
    cropRecoveryAvailable: data.cropRecoveryAvailable,
    commerce: importCommerce(data.commerce, buildings, savedTime),
    coins: data.coins,
    inventory: {
      vegetable: data.inventory.vegetable,
      wheat: data.inventory.wheat,
      lettuce: data.inventory.lettuce,
      chilledVegetable: data.inventory.chilledVegetable,
      wood: data.inventory.wood,
      stone: data.inventory.stone,
    },
    buildings,
    nextId: data.nextId,
    completedOrders: data.completedOrders,
    lastSeenAt: savedTime,
  };
  for (const b of buildings) validatePlacement(state, b);
  requireRule(getUsedStorage(state) <= getCapacity(state), '库存超过仓储容量');
  return advance(state, now);
}
export function exportSave(state: GameState): string {
  return JSON.stringify(importSave(JSON.stringify(state), state.lastSeenAt));
}
