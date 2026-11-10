import { getV7World } from './v7-world';
import type { GameState } from './types';
import type { Terrain6State, V6CellCheckpoint, V6FillLayer } from './v6-edit-types';
import { getV6World } from './v6-world';
import { resourceAfterV6Cut, getV6EditSurface } from './v6-edit-surface';
import { fillLayerQuanta, v6EditPlane as plane, V6_EDIT_MAX_LEVEL } from './v6-material-volume';
import { integer, requireRule } from './guards';
import { isV6Material } from './v6-material-amount';
function exact(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  requireRule(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join() === fields.sort().join(),
    'v6地形记录字段无效',
  );
}
/** A bounded per-cell checkpoint, never an operation journal or a trusted yield ledger. */
export function parseTerrain6(value: unknown, seed: number, version: 6 | 7 = 6): Terrain6State {
  exact(value, ['format', 'nextOperation', 'cells']);
  const world = version === 7 ? getV7World(seed) : getV6World(seed);
  requireRule(
    value.format === 1 &&
      integer(value.nextOperation) &&
      value.nextOperation >= 1 &&
      Array.isArray(value.cells) &&
      value.cells.length <= world.size ** 2,
    'v6地形状态无效',
  );
  const keys = new Set<string>();
  const cells: V6CellCheckpoint[] = value.cells
    .map((raw) => {
      exact(raw, ['x', 'z', 'initialResourceAmount', 'cutLevel', 'level', 'fills']);
      requireRule(
        integer(raw.x, world.size - 1) &&
          integer(raw.z, world.size - 1) &&
          integer(raw.initialResourceAmount, V6_EDIT_MAX_LEVEL) &&
          (raw.cutLevel === null || integer(raw.cutLevel, V6_EDIT_MAX_LEVEL)) &&
          integer(raw.level, V6_EDIT_MAX_LEVEL) &&
          Array.isArray(raw.fills) &&
          raw.fills.length <= V6_EDIT_MAX_LEVEL,
        'v6地形单元无效',
      );
      const x = raw.x,
        z = raw.z,
        key = `${x},${z}`;
      requireRule(!keys.has(key), 'v6地形单元重复');
      keys.add(key);
      const original = world.resourceAt(x, z);
      requireRule(raw.initialResourceAmount <= (original?.amount ?? 0), 'v6原生资源初值无效');
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const c = world.at(x + dx, z + dz),
            h = world.hydrology.at(x + dx, z + dz);
          requireRule(
            c &&
              !c.reserved &&
              h?.state === 'dryBuildable' &&
              h.dryLower >= 1.8 + (version === 7 ? 1e-5 : 0),
            'v6改造越过受保护缓冲区',
          );
        }
      const levels = new Set<number>();
      const fills: V6FillLayer[] = raw.fills.map((f) => {
        exact(f, ['level', 'material']);
        requireRule(
          integer(f.level, raw.level as number) &&
            f.level > 0 &&
            isV6Material(f.material) &&
            !levels.has(f.level),
          'v6填筑层无效',
        );
        levels.add(f.level);
        return { level: f.level, material: f.material };
      });
      requireRule(raw.cutLevel === null || raw.cutLevel <= raw.level, 'v6开挖裁切面高于表面');
      const cell: V6CellCheckpoint = {
        x,
        z,
        initialResourceAmount: raw.initialResourceAmount,
        cutLevel: raw.cutLevel,
        level: raw.level,
        fills: fills.sort((a, b) => a.level - b.level),
      };
      for (let level = 1; level <= cell.level; level++) {
        const need = fillLayerQuanta(world, cell, level);
        requireRule(levels.has(level) === need > 0, 'v6填筑层缺失或与天然体积重叠');
      }
      requireRule(cell.cutLevel !== null || fills.length > 0, 'v6记录没有实际地形改造');
      return cell;
    })
    .sort((a, b) => a.z - b.z || a.x - b.x);
  requireRule(value.nextOperation > cells.length, 'v6操作序号早于地形检查点');
  return { format: 1, nextOperation: value.nextOperation, cells };
}
/** No live occupancy oracle is used for reconstruction. Validate only the completed final layout. */
export function validateTerrain6Resources(state: GameState): void {
  const world = (state.terrainVersion === 7 ? getV7World : getV6World)(state.mapSeed),
    surface = getV6EditSurface(state);
  const resources = new Map(state.naturalResources.map((r) => [`${r.x},${r.z}`, r]));
  for (const cell of state.terrain6!.cells) {
    const expected = resourceAfterV6Cut(world, cell),
      current = resources.get(`${cell.x},${cell.z}`);
    requireRule(
      expected
        ? current &&
            current.id === expected.id &&
            current.kind === expected.kind &&
            current.amount === expected.amount
        : !current,
      'v6天然资源与地形检查点不一致',
    );
    for (let j = 0; j <= 4; j++)
      for (let i = 0; i <= 4; i++)
        requireRule(
          surface.retainedHeightInCell(cell.x + i / 4, cell.z + j / 4, cell.x, cell.z) <=
            plane(cell.level),
          'v6检查点表面切入未记录天然体积',
        );
  }
}
