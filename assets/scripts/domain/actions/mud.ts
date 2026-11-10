import { validateV6Extensions } from '../v6-maritime';
import type { Command, GameState } from '../types';
import { worldSize } from '../world';
import { integer, requireRule } from '../guards';
import { useDurability } from '../foundation';
import { isLandCell } from '../island';
import { touchesLand, blocksDockWater } from '../expansion';
import { validateV5Extensions } from '../v5-marine';
import { hasDockExit } from '../merge-plan';
import { buildingOccupiesCell } from '../building-cells';
import { find } from '../state';
import { validatePlacement } from '../geometry';

/** One release consumes nine selected soil units, even when the last pile has leftovers. */
export function waterSoil(
  s: GameState,
  c: Extract<Command, { type: 'useTool'; tool: 'wateringCan'; x: number }>,
): string[] {
  requireRule(
    Array.isArray(c.sources) && c.sources.length >= 2 && c.sources.length <= 9,
    '暂不可用',
  );
  const keys = new Set<string>();
  const sources = c.sources.map((point) => {
    requireRule(
      point &&
        integer(point.x, worldSize(s.terrainVersion) - 1) &&
        integer(point.z, worldSize(s.terrainVersion) - 1),
      '暂不可用',
    );
    const key = `${point.x},${point.z}`;
    requireRule(!keys.has(key), '暂不可用');
    keys.add(key);
    const pile = s.groundStacks.find((p) => p.x === point.x && p.z === point.z);
    requireRule(pile && pile.item === 'soil', '暂不可用');
    return pile;
  });
  const anchor = sources[0]!;
  requireRule(c.x === anchor.x && c.z === anchor.z, '暂不可用');
  requireRule(sources.reduce((sum, p) => sum + p.amount, 0) >= 9, '暂不可用');
  let remaining = 9;
  for (const pile of sources) {
    const amount = Math.min(remaining, pile.amount);
    pile.amount -= amount;
    remaining -= amount;
  }
  s.groundStacks = s.groundStacks.filter((p) => p.amount > 0);
  requireRule(!s.groundStacks.some((p) => p.x === c.x && p.z === c.z), '暂不可用');
  s.groundStacks.push({ x: c.x, z: c.z, item: 'mud', amount: 1 });
  useDurability(s, 'wateringCan');
  return [''];
}

/** Mud is spent only after all placement checks succeed, in the dispatch clone. */
export function expandLand(s: GameState, c: Extract<Command, { type: 'expandLand' }>): string[] {
  const source = s.groundStacks.find((p) => p.x === c.fromX && p.z === c.fromZ);
  requireRule(source?.item === 'mud' && source.amount === 9, '暂不可用');
  requireRule(
    integer(c.x, worldSize(s.terrainVersion) - 2) &&
      c.x >= 1 &&
      integer(c.z, worldSize(s.terrainVersion) - 2) &&
      c.z >= 1,
    '位置不可用',
  );
  requireRule(!isLandCell(c.x, c.z, s.mapSeed, s.terrainVersion, s.landExtensions), '位置不可用');
  requireRule(touchesLand(c, s.mapSeed, s.terrainVersion, s.landExtensions), '位置不可用');
  requireRule(!blocksDockWater(c, s.buildings), '请保留船坞出口');
  if (s.terrainVersion === 5 || s.terrainVersion === 6 || s.terrainVersion === 7) {
    requireRule(
      !s.buildings.some((b) => buildingOccupiesCell(b, c.x, c.z)) &&
        ![...s.trees, ...s.naturalResources, ...s.groundStacks].some(
          (p) => p.x === c.x && p.z === c.z,
        ) &&
        !s.looseDrops.some((p) => Math.floor(p.x6 / 6) === c.x && Math.floor(p.z6 / 6) === c.z),
      '位置已被占用',
    );
    const proposed = [...s.landExtensions, { x: c.x, z: c.z }];
    if (s.terrainVersion === 6 || s.terrainVersion === 7)
      validateV6Extensions(s.mapSeed, proposed, s.terrainVersion);
    else validateV5Extensions(s.mapSeed, proposed);
    requireRule(
      s.buildings.every(
        (b) => b.kind !== 'dock' || hasDockExit({ ...s, landExtensions: proposed }, b),
      ),
      '请保留船坞侧泊位和外海通路',
    );
  }
  s.landExtensions.push({ x: c.x, z: c.z });
  s.groundStacks = s.groundStacks.filter((p) => p !== source);
  return [''];
}

/** Transform in place. Identity, other attachments and footprint remain unchanged. */
export function buildResidence(
  s: GameState,
  c: Extract<Command, { type: 'buildResidence' }>,
): string[] {
  const house = find(s, c.buildingId);
  requireRule(house.kind === 'house' && !house.job && !house.cropJobs?.some(Boolean), '暂不可用');
  if (c.source !== undefined) {
    requireRule(
      c.source &&
        integer(c.source.x, worldSize(s.terrainVersion) - 1) &&
        integer(c.source.z, worldSize(s.terrainVersion) - 1),
      '暂不可用',
    );
    const pile = s.groundStacks.find((p) => p.x === c.source!.x && p.z === c.source!.z);
    requireRule(pile?.item === 'mud' && pile.amount > 0, '暂不可用');
    pile.amount--;
    if (!pile.amount) s.groundStacks = s.groundStacks.filter((p) => p !== pile);
  } else {
    requireRule(s.inventory.mud >= 1, '库存不足');
    s.inventory.mud--;
  }
  house.kind = 'residence';
  validatePlacement(s, house);
  return [''];
}
