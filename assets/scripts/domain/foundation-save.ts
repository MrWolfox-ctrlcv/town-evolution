import { getV7World } from './v7-world';
import { getV6World } from './v6-world';
import { validItemAmount } from './v6-material-amount';
import type { TerrainVersion } from './world';
import type { GameState, Tree, GroundStack, NaturalResource, LandCell } from './types';
import { isLandCell } from './island';
import { terrainAt } from './terrain';
import { MAX_TERRAIN_HEIGHT } from './world';
import { CONFIG } from './config';
import { ITEM_KEYS } from './crops';
import { TOOL_IDS, initialTools, initialToolRecovery, stackLimitFor } from './foundation';
import { parseTreeGrowth } from './nursery-save';
import { requireRule, integer } from './guards';
function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
export function importFoundation(
  raw: Record<string, unknown>,
  legacy: boolean,
  gridLimit = CONFIG.gridSize,
  seed = 1,
  terrainVersion: TerrainVersion = 3,
  landExtensions: readonly LandCell[] = [],
): Pick<
  GameState,
  'tools' | 'toolRecoveryAvailable' | 'trees' | 'nextTreeId' | 'groundStacks' | 'naturalResources'
> {
  const current = raw.schemaVersion === 9 || raw.schemaVersion === 10;
  if (current) requireRule(raw.naturalResources !== undefined, '天然资源列表缺失');
  const result = {
    tools: initialTools(),
    toolRecoveryAvailable: initialToolRecovery(),
    trees: [] as Tree[],
    naturalResources: [] as NaturalResource[],
    nextTreeId: 1,
    groundStacks: [] as GroundStack[],
  };
  if (legacy) return result;
  requireRule(record(raw.tools) && record(raw.toolRecoveryAvailable), '工具记录无效');
  for (const tool of TOOL_IDS) {
    if (
      !current &&
      tool === 'diggingTool' &&
      raw.tools[tool] === undefined &&
      raw.toolRecoveryAvailable[tool] === undefined
    )
      continue;
    requireRule(
      integer(raw.tools[tool]) && typeof raw.toolRecoveryAvailable[tool] === 'boolean',
      '工具耐久或应急状态无效',
    );
    result.tools[tool] = raw.tools[tool] as number;
    result.toolRecoveryAvailable[tool] = raw.toolRecoveryAvailable[tool] as boolean;
  }
  requireRule(integer(raw.nextTreeId) && raw.nextTreeId >= 1, '树木编号无效');
  result.nextTreeId = raw.nextTreeId;
  requireRule(
    Array.isArray(raw.trees) &&
      raw.trees.length <= gridLimit ** 2 &&
      Array.isArray(raw.groundStacks) &&
      raw.groundStacks.length <= gridLimit ** 2,
    '地面记录无效',
  );
  const cells = new Set<string>(),
    ids = new Set<string>();
  function acceptCell(
    value: Record<string, unknown>,
    allowOccupied = false,
  ): { x: number; z: number } {
    requireRule(integer(value.x, gridLimit - 1) && integer(value.z, gridLimit - 1), '地块位置无效');
    requireRule(
      isLandCell(value.x, value.z, seed, terrainVersion, landExtensions),
      '地面物品不能位于水域',
    );
    const key = `${value.x},${value.z}`;
    requireRule(allowOccupied || !cells.has(key), '树木或地堆重叠');
    cells.add(key);
    return { x: value.x, z: value.z };
  }
  for (const value of raw.trees) {
    requireRule(
      record(value) &&
        typeof value.id === 'string' &&
        /^t[1-9][0-9]{0,8}$/.test(value.id) &&
        !ids.has(value.id) &&
        Number(value.id.slice(1)) < result.nextTreeId,
      '树木记录无效',
    );
    ids.add(value.id);
    result.trees.push({
      id: value.id,
      ...acceptCell(value),
      ...parseTreeGrowth(value, raw.lastSeenAt as number),
    });
  }
  for (const value of raw.groundStacks) {
    requireRule(
      record(value) &&
        ITEM_KEYS.includes(value.item as never) &&
        validItemAmount(
          value.amount,
          value.item,
          terrainVersion,
          stackLimitFor(value.item as GroundStack['item']),
        ) &&
        value.amount > 0,
      '地堆产品或数量无效',
    );
    result.groundStacks.push({
      ...acceptCell(value),
      item: value.item as GroundStack['item'],
      amount: value.amount,
    });
  }
  // Absence is the additive v8 migration. Never regenerate resource blocks on import.
  if (raw.naturalResources !== undefined) {
    requireRule(
      Array.isArray(raw.naturalResources) && raw.naturalResources.length <= gridLimit ** 2,
      '天然资源列表无效',
    );
    const resourceCells = new Set<string>();
    for (const value of raw.naturalResources) {
      requireRule(
        record(value) &&
          typeof value.id === 'string' &&
          (value.kind === 'stone' || value.kind === 'soil') &&
          integer(
            value.amount,
            terrainVersion >= 5 ? 64 : terrainVersion === 4 ? MAX_TERRAIN_HEIGHT : 4,
          ) &&
          value.amount > 0,
        '天然资源记录无效',
      );
      const point = acceptCell(value, terrainVersion >= 6);
      const resourceKey = `${point.x},${point.z}`;
      requireRule(!resourceCells.has(resourceKey), '天然资源重复');
      resourceCells.add(resourceKey);
      if (terrainVersion >= 6) {
        const resource: NaturalResource = {
          id: value.id,
          kind: value.kind,
          amount: value.amount,
          ...point,
        };
        requireRule(
          (terrainVersion === 7 ? getV7World : getV6World)(seed).acceptsResource(resource),
          '天然资源与地图不一致',
        );
        result.naturalResources.push(resource);
        continue;
      }
      const terrain = terrainAt(point.x, point.z, seed, terrainVersion);
      requireRule(
        value.id === `n${point.x}_${point.z}` &&
          terrain &&
          value.amount <= terrain.elevation &&
          ((value.kind === 'stone' && terrain.biome === 'mountain') ||
            (value.kind === 'soil' && terrain.biome === 'hill')),
        '天然资源与地图不一致',
      );
      result.naturalResources.push({
        id: value.id,
        kind: value.kind,
        amount: value.amount,
        ...point,
      });
    }
  }
  return result;
}
