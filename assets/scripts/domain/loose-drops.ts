import { validItemAmount } from './v6-material-amount';
import { getV6EditSurface } from './v6-edit-surface';
export { farmCellCenterSixths as cropDropAnchor } from './farm-coordinates';
import { farmCellAtSixths } from './farm-coordinates';
export type { DropSource, LooseDrop } from './types';
import type { GameState, Item, Building, DropSource, LooseDrop } from './types';
import { isCrop } from './crops';
import { stackLimitFor } from './foundation';
import { isLandCell } from './island';
import { worldSize } from './world';
import { MAX_VALUE } from './config';
import { buildingOccupiesCell } from './building-cells';
import { integer, requireRule } from './guards';
export const LOOSE_DROPS = Object.freeze({ maxCount: 4096, searchRadius6: 12, spacing6: 2 });
export type DropWorld = Pick<
  GameState,
  | 'mapSeed'
  | 'terrainVersion'
  | 'landExtensions'
  | 'buildings'
  | 'trees'
  | 'naturalResources'
  | 'groundStacks'
  | 'nextId'
  | 'terrain6'
> & { looseDrops: readonly LooseDrop[] };
export function cloneLooseDrop(drop: LooseDrop): LooseDrop {
  return { ...drop, source: { ...drop.source } };
}
export function dropPosition(drop: Pick<LooseDrop, 'x6' | 'z6'>): { x: number; z: number } {
  return { x: drop.x6 / 6, z: drop.z6 / 6 };
}
export function dropInsideBuilding(drop: Pick<LooseDrop, 'x6' | 'z6'>, b: Building): boolean {
  return buildingOccupiesCell(b, Math.floor(drop.x6 / 6), Math.floor(drop.z6 / 6));
}
function sourceEqual(a: DropSource, b: DropSource): boolean {
  if (a.type === 'terrain6' && b.type === 'terrain6')
    return a.x === b.x && a.z === b.z && a.operation === b.operation && a.kind === b.kind;
  return a.type === 'natural' && b.type === 'natural'
    ? a.resourceId === b.resourceId && a.kind === b.kind
    : a.type === 'crop' &&
        b.type === 'crop' &&
        a.buildingId === b.buildingId &&
        a.cell === b.cell &&
        a.jobId === b.jobId;
}
function available(
  world: DropWorld,
  point: { x6: number; z6: number },
  source: DropSource,
): boolean {
  const size6 = worldSize(world.terrainVersion) * 6;
  if (!integer(point.x6, size6 - 1) || !integer(point.z6, size6 - 1)) return false;
  const x = Math.floor(point.x6 / 6),
    z = Math.floor(point.z6 / 6);
  if (!isLandCell(x, z, world.mapSeed, world.terrainVersion, world.landExtensions)) return false;
  if (
    world.trees.some((p) => p.x === x && p.z === z) ||
    world.groundStacks.some((p) => p.x === x && p.z === z)
  )
    return false;
  if (
    world.naturalResources.some(
      (p) =>
        p.x === x &&
        p.z === z &&
        !(source.type === 'natural' && p.id === source.resourceId) &&
        !(source.type === 'terrain6' && source.x === x && source.z === z) &&
        (world.terrainVersion !== 6 || !!getV6EditSurface(world).exposedResourceAt(x, z)),
    )
  )
    return false;
  return !world.buildings.some(
    (b) =>
      dropInsideBuilding(point, b) &&
      !(
        b.kind === 'farm' &&
        source.type === 'crop' &&
        b.id === source.buildingId &&
        (farmCellAtSixths(b, point) === source.cell ||
          !b.cropJobs?.[farmCellAtSixths(b, point) ?? -1])
      ),
  );
}
/** Pure whole-output plan: insufficient local room leaves resources, jobs, IDs and tools untouched. */
export function planLooseDrops(
  world: DropWorld,
  item: Item,
  amount: number,
  anchor: { x6: number; z6: number },
  source: DropSource,
): { drops: LooseDrop[]; nextId: number } {
  requireRule(validItemAmount(amount, item, world.terrainVersion) && amount > 0, '掉落数量无效');
  requireRule(source.type === 'crop' ? isCrop(item) : item === source.kind, '掉落来源与物品不符');
  const size6 = worldSize(world.terrainVersion) * 6;
  requireRule(integer(anchor.x6, size6 - 1) && integer(anchor.z6, size6 - 1), '掉落来源位置无效');
  const limit = stackLimitFor(item),
    drops = world.looseDrops.map(cloneLooseDrop);
  let remaining = amount,
    nextId = world.nextId;
  const radius = LOOSE_DROPS.searchRadius6;
  for (const drop of drops) {
    if (
      drop.item !== item ||
      !sourceEqual(drop.source, source) ||
      Math.abs(drop.x6 - anchor.x6) > radius ||
      Math.abs(drop.z6 - anchor.z6) > radius
    )
      continue;
    const take = Math.min(remaining, limit - drop.amount);
    drop.amount += take;
    remaining -= take;
    if (!remaining) return { drops, nextId };
  }
  const points: { x6: number; z6: number; distance: number }[] = [];
  for (let dz = -radius; dz <= radius; dz += LOOSE_DROPS.spacing6)
    for (let dx = -radius; dx <= radius; dx += LOOSE_DROPS.spacing6)
      points.push({ x6: anchor.x6 + dx, z6: anchor.z6 + dz, distance: dx * dx + dz * dz });
  points.sort((a, b) => a.distance - b.distance || a.z6 - b.z6 || a.x6 - b.x6);
  for (const point of points) {
    if (
      !available(world, point, source) ||
      drops.some((d) => (d.x6 - point.x6) ** 2 + (d.z6 - point.z6) ** 2 < LOOSE_DROPS.spacing6 ** 2)
    )
      continue;
    requireRule(drops.length < LOOSE_DROPS.maxCount, '掉落空间不足，请先拾取附近物品');
    requireRule(nextId < MAX_VALUE, '编号达到上限');
    const take = Math.min(remaining, limit);
    drops.push({
      id: `d${nextId++}`,
      item,
      amount: take,
      x6: point.x6,
      z6: point.z6,
      source: { ...source },
    });
    remaining -= take;
    if (!remaining) return { drops, nextId };
  }
  throw new Error('附近没有足够的掉落空间，请先拾取物品');
}
