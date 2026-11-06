import { parseBridgeState } from './bridge-save';
import { parseCompostState } from './compost-save';
import { parseLooseDrops } from './loose-drops-save';
import { parseFarmBox } from './farm-box-save';
import { validateDropPlacements } from './loose-drop-placement';
import type { GameState, Building, BuildingKind, Job } from './types';
import { farmCellCount } from './farming';
import { importFoundation } from './foundation-save';
import { importLandExtensions, blocksDockWater } from './expansion';
import { importStock } from './stock-save';
import { parseNurseryJob } from './nursery-save';
import { parseProcessingJob } from './processing-save';
import { importFusion } from './fusion-state';
import { isCrop, MAX_CROP_DURATION, MAX_CROP_YIELD } from './crops';
import { importCommerce } from './commerce-save';
import { worldSize } from './world';
import { CONFIG, MAX_TIME } from './config';
import { requireRule, integer, time } from './guards';
import { advance, getCapacity, getUsedStorage } from './state';
import { validateTownPlacements } from './geometry';
import { hasDockExit } from './merge-plan';
import { V5_GENERATOR_REVISION } from './v5-world';
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export class SaveVersionError extends Error {}
export const MAX_SAVE_CHARACTERS = 4_000_000;
/** Current-world imports are strict. Authorized old-test clearing belongs to the storage adapter. */
export function importSave(text: string, now: number): GameState {
  time(now);
  requireRule(typeof text === 'string' && text.length <= MAX_SAVE_CHARACTERS, '存档过大或格式无效');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('存档不是有效 JSON');
  }
  requireRule(record(data), '存档结构无效');
  if (data.schemaVersion !== 8 && data.schemaVersion !== 9 && data.schemaVersion !== 10)
    throw new SaveVersionError('不支持此存档版本，请保留备份');
  if (data.schemaVersion >= 9)
    requireRule(
      data.terrainVersion !== undefined &&
        data.landExtensions !== undefined &&
        data.fusion !== undefined,
      '当前存档缺少地图或融合记录',
    );
  requireRule(integer(data.mapSeed) && data.mapSeed > 0, '地图种子无效');
  const terrainVersion = data.terrainVersion === undefined ? 1 : data.terrainVersion;
  requireRule(
    terrainVersion === 1 ||
      terrainVersion === 2 ||
      terrainVersion === 3 ||
      terrainVersion === 4 ||
      terrainVersion === 5,
    '地图版本无效',
  );
  if (terrainVersion === 5 && data.terrainRevision !== V5_GENERATOR_REVISION)
    throw new SaveVersionError(
      '此 v5 预览地形版本不兼容，请保留原始存档；不会重新生成或重解释旧数据',
    );
  const landExtensions = importLandExtensions(data.landExtensions, data.mapSeed, terrainVersion);
  requireRule(
    integer(data.coins) &&
      integer(data.nextId) &&
      data.nextId >= 1 &&
      integer(data.completedOrders),
    '存档数值无效',
  );
  requireRule(integer(data.lastSeenAt, MAX_TIME), '存档时间无效');
  const inventory = importStock(data.inventory, data.schemaVersion);
  requireRule(typeof data.cropRecoveryAvailable === 'boolean', '种苗恢复状态无效');
  requireRule(
    Array.isArray(data.buildings) && data.buildings.length <= worldSize(terrainVersion) ** 2,
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
      integer(raw.x, worldSize(terrainVersion)) &&
        integer(raw.z, worldSize(terrainVersion)) &&
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
    requireRule(
      raw.nurserySeeded === undefined || (b.kind === 'nursery' && raw.nurserySeeded === true),
      '育苗状态无效',
    );
    if (raw.nurserySeeded === true) b.nurserySeeded = true;
    requireRule(
      raw.dockStyle === undefined || (b.kind === 'dock' && raw.dockStyle === 'simple'),
      '船坞类型无效',
    );
    requireRule(
      raw.boatAttached === undefined || (b.kind === 'dock' && raw.boatAttached === true),
      '船坞船只状态无效',
    );
    if (raw.dockStyle === 'simple') b.dockStyle = 'simple';
    if (raw.boatAttached === true) b.boatAttached = true;
    requireRule(raw.bridge === undefined || b.kind === 'woodenBridge', '此建筑不应有木桥状态');
    if (b.kind === 'woodenBridge') {
      requireRule(
        data.schemaVersion === 10 && raw.job === undefined && raw.processingJob === undefined,
        '木桥版本或生产状态无效',
      );
      b.bridge = parseBridgeState(
        raw.bridge,
        b.id,
        { mapSeed: data.mapSeed, terrainVersion, landExtensions },
        acceptId,
      );
    }
    requireRule(raw.compost === undefined || b.kind === 'compostBarrel', '此建筑不应有堆肥状态');
    if (b.kind === 'compostBarrel') {
      requireRule(data.schemaVersion === 10, '旧版本不应有堆肥木桶');
      requireRule(raw.job === undefined && raw.processingJob === undefined, '堆肥生产状态冲突');
      b.compost = parseCompostState(raw.compost, savedTime, acceptId, data.schemaVersion);
    }
    if (raw.processingJob !== undefined) {
      requireRule(
        raw.job === undefined && raw.cropJobs === undefined && raw.nurserySeeded === undefined,
        '生产状态冲突',
      );
      b.processingJob = parseProcessingJob(raw.processingJob, b.kind, savedTime, acceptId);
    }
    requireRule(raw.collectionBox === undefined || b.kind === 'farm', '此建筑不应有田箱');
    if (raw.collectionBox !== undefined)
      b.collectionBox = parseFarmBox(raw.collectionBox, acceptId, data.schemaVersion);
    if (b.kind === 'farm') {
      requireRule(raw.farmSize === undefined || raw.farmSize === 6, '田地大小无效');
      requireRule(raw.irrigated === undefined || raw.irrigated === true, '田地灌水状态无效');
      if (raw.farmSize === 6) b.farmSize = 6;
      if (raw.irrigated === true) b.irrigated = true;
      const count = farmCellCount(b);
      requireRule(
        raw.job === undefined && Array.isArray(raw.cropJobs) && raw.cropJobs.length === count,
        `田地应有${count}个独立小格`,
      );
      b.cropJobs = raw.cropJobs.map((value) => {
        if (value === null) return null;
        requireRule(record(value) && isCrop(value.crop), '作物类型无效');
        const snapshot = value.durationMs !== undefined || value.yield !== undefined;
        if (snapshot)
          requireRule(
            integer(value.durationMs, MAX_CROP_DURATION) &&
              value.durationMs > 0 &&
              integer(value.yield, MAX_CROP_YIELD) &&
              value.yield > 0,
            '作物任务配置无效',
          );
        const job = parseJob(value, snapshot ? (value.durationMs as number) : 15_000);
        if (snapshot) {
          job.durationMs = value.durationMs as number;
          job.yield = value.yield as number;
        }
        return { ...job, crop: value.crop };
      });
    } else {
      requireRule(
        raw.cropJobs === undefined && raw.farmSize === undefined && raw.irrigated === undefined,
        '此建筑不应有田地状态',
      );
      if (raw.job !== undefined) {
        if (b.kind === 'nursery') {
          requireRule(b.nurserySeeded, '育苗任务缺少树种');
          b.job = parseNurseryJob(raw.job, savedTime, acceptId);
        } else {
          requireRule(b.kind === 'coldWarehouse', '此建筑不应有生产任务');
          b.job = parseJob(raw.job, CONFIG.coldDurationMs);
        }
      }
    }
    buildings.push(b);
  }
  const looseDrops = parseLooseDrops(
    data.looseDrops === undefined && data.schemaVersion === 8 ? [] : data.looseDrops,
    { mapSeed: data.mapSeed, terrainVersion, landExtensions, nextId: data.nextId },
    acceptId,
  );
  requireRule(data.nextId > maxId, '存档编号顺序无效');
  const state: GameState = {
    schemaVersion: 10,
    fusion: importFusion(data.fusion, buildings, savedTime, data.schemaVersion),
    mapSeed: data.mapSeed,
    terrainVersion,
    ...(terrainVersion === 5 ? { terrainRevision: V5_GENERATOR_REVISION } : {}),
    landExtensions,
    ...importFoundation(
      data,
      false,
      worldSize(terrainVersion),
      data.mapSeed,
      terrainVersion,
      landExtensions,
    ),
    looseDrops,
    cropRecoveryAvailable: data.cropRecoveryAvailable,
    commerce: importCommerce(data.commerce, buildings, savedTime, false, false, data.schemaVersion),
    coins: data.coins,
    inventory,
    buildings,
    nextId: data.nextId,
    completedOrders: data.completedOrders,
    lastSeenAt: savedTime,
  };
  requireRule(!landExtensions.some((p) => blocksDockWater(p, buildings)), '扩地占用船坞出口');
  if (terrainVersion === 5)
    requireRule(
      buildings.every((b) => b.kind !== 'dock' || hasDockExit(state, b)),
      '船坞必须保留通向外海的两格出口',
    );
  validateTownPlacements(state);
  validateDropPlacements(state);
  requireRule(getUsedStorage(state) <= getCapacity(state), '库存超过仓储容量');
  return advance(state, now);
}
export function exportSave(state: GameState): string {
  return JSON.stringify(importSave(JSON.stringify(state), state.lastSeenAt));
}
