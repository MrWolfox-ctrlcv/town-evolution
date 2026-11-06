import type { GameState, Item } from './types';
import type { DropSource, LooseDrop } from './loose-drops';
import { LOOSE_DROPS } from './loose-drops';
import { isCrop, ITEM_KEYS } from './crops';
import { stackLimitFor } from './foundation';
import { integer, requireRule } from './guards';
import { isLandCell } from './island';
import { worldSize } from './world';
function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwnProperty.call(value, k))
  );
}
function source(value: unknown, item: Item, size: number, nextId: number): DropSource {
  requireRule(record(value), '掉落来源无效');
  if (value.type === 'natural') {
    requireRule(
      exact(value, ['type', 'resourceId', 'kind']) &&
        typeof value.resourceId === 'string' &&
        /^n[0-9]{1,3}_[0-9]{1,3}$/.test(value.resourceId) &&
        (value.kind === 'soil' || value.kind === 'stone') &&
        item === value.kind,
      '天然掉落来源无效',
    );
    const match = /^n(0|[1-9][0-9]*)_(0|[1-9][0-9]*)$/.exec(value.resourceId);
    requireRule(
      match && Number(match[1]) < size && Number(match[2]) < size,
      '天然掉落来源编号无效',
    );
    return { type: 'natural', resourceId: value.resourceId, kind: value.kind };
  }
  requireRule(
    value.type === 'crop' &&
      exact(value, ['type', 'buildingId', 'cell', 'jobId']) &&
      typeof value.buildingId === 'string' &&
      /^b[1-9][0-9]{0,8}$/.test(value.buildingId) &&
      typeof value.jobId === 'string' &&
      /^j[1-9][0-9]{0,8}$/.test(value.jobId) &&
      integer(value.cell, 35) &&
      isCrop(item),
    '作物掉落来源无效',
  );
  requireRule(
    Number(value.buildingId.slice(1)) < nextId && Number(value.jobId.slice(1)) < nextId,
    '作物掉落来源编号无效',
  );
  return { type: 'crop', buildingId: value.buildingId, cell: value.cell, jobId: value.jobId };
}
/** Historical producer references need not still exist. Drop assets never follow moved producers. */
export function parseLooseDrops(
  value: unknown,
  world: Pick<GameState, 'mapSeed' | 'terrainVersion' | 'landExtensions' | 'nextId'>,
  acceptId: (id: unknown, prefix: string) => string,
): LooseDrop[] {
  requireRule(Array.isArray(value) && value.length <= LOOSE_DROPS.maxCount, '掉落列表无效');
  const size6 = worldSize(world.terrainVersion) * 6,
    occupied = new Set<string>();
  return value.map((raw) => {
    requireRule(
      record(raw) &&
        exact(raw, ['id', 'item', 'amount', 'x6', 'z6', 'source']) &&
        ITEM_KEYS.includes(raw.item as Item),
      '掉落记录无效',
    );
    const item = raw.item as Item;
    requireRule(
      integer(raw.amount, stackLimitFor(item)) &&
        raw.amount > 0 &&
        integer(raw.x6, size6 - 1) &&
        integer(raw.z6, size6 - 1),
      '掉落数量或位置无效',
    );
    requireRule(
      isLandCell(
        Math.floor(raw.x6 / 6),
        Math.floor(raw.z6 / 6),
        world.mapSeed,
        world.terrainVersion,
        world.landExtensions,
      ),
      '掉落物不能位于水域',
    );
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        requireRule(!occupied.has(`${raw.x6 + dx},${raw.z6 + dz}`), '掉落物相互重叠');
    occupied.add(`${raw.x6},${raw.z6}`);
    return {
      id: acceptId(raw.id, 'd'),
      item,
      amount: raw.amount,
      x6: raw.x6,
      z6: raw.z6,
      source: source(raw.source, item, worldSize(world.terrainVersion), world.nextId),
    };
  });
}
