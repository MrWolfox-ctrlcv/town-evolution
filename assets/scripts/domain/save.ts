import type { GameState, Building, BuildingKind } from './types';
import { CONFIG, MAX_TIME } from './config';
import { requireRule, integer, time } from './guards';
import { advance, getCapacity, getUsedStorage } from './state';
import { validatePlacement } from './geometry';
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export class SaveVersionError extends Error {}
/** Strict versioned boundary: malformed/unsupported saves never partially replace state. */
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
  if (data.schemaVersion !== 1) throw new SaveVersionError('不支持此存档版本，请保留备份');
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
      integer(data.inventory.chilledVegetable),
    '库存无效',
  );
  requireRule(
    Array.isArray(data.buildings) && data.buildings.length <= CONFIG.gridSize ** 2,
    '建筑列表无效',
  );
  const buildings: Building[] = [],
    ids = new Set<string>();
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
        (raw.rotation === 0 || raw.rotation === 1),
      '建筑位置无效',
    );
    const b: Building = {
      id: acceptId(raw.id, 'b'),
      kind: raw.kind as BuildingKind,
      x: raw.x,
      z: raw.z,
      rotation: raw.rotation,
    };
    if (raw.job !== undefined) {
      requireRule(b.kind === 'farm' || b.kind === 'coldWarehouse', '此建筑不应有生产任务');
      requireRule(
        record(raw.job) &&
          integer(raw.job.startedAt, MAX_TIME) &&
          integer(raw.job.readyAt, MAX_TIME),
        '生产时间无效',
      );
      const duration = b.kind === 'farm' ? CONFIG.cropDurationMs : CONFIG.coldDurationMs;
      requireRule(
        raw.job.startedAt <= data.lastSeenAt && raw.job.readyAt - raw.job.startedAt === duration,
        '生产任务时间不一致',
      );
      b.job = {
        id: acceptId(raw.job.id, 'j'),
        startedAt: raw.job.startedAt,
        readyAt: raw.job.readyAt,
      };
    }
    buildings.push(b);
  }
  requireRule(data.nextId > maxId, '存档编号顺序无效');
  const state: GameState = {
    schemaVersion: 1,
    coins: data.coins,
    inventory: {
      vegetable: data.inventory.vegetable,
      chilledVegetable: data.inventory.chilledVegetable,
    },
    buildings,
    nextId: data.nextId,
    completedOrders: data.completedOrders,
    lastSeenAt: data.lastSeenAt,
  };
  for (const b of buildings) validatePlacement(state, b);
  requireRule(getUsedStorage(state) <= getCapacity(state), '库存超过仓储容量');
  return advance(state, now);
}
export function exportSave(state: GameState): string {
  // Validate outgoing state too. Only trusted fields are emitted.
  return JSON.stringify(importSave(JSON.stringify(state), state.lastSeenAt));
}
