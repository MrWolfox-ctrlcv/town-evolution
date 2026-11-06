import type { EntitySnapshot, GameState, LandCell } from './types';
import { BRIDGE_CROSSING, validateBridgeTerrain } from './bridge-terrain';
export { BRIDGE_CROSSING } from './bridge-terrain';
import { buildingOccupiedCells } from './building-cells';
import { stockTotal } from './commerce';
import { integer, requireRule } from './guards';

export interface BridgeCrossingPlan {
  retainedId: string;
  consumedId: string;
  x: number;
  z: number;
  rotation: 0 | 1;
  width: 2;
  length: number;
  endpointCells: LandCell[];
  riverCells: LandCell[];
  occupiedCells: LandCell[];
}

/** Exact component matching plus the same crossing certificate used by saved buildings. */
export function bridgeCrossingPlan(
  state: GameState,
  sources: readonly EntitySnapshot[],
): BridgeCrossingPlan {
  requireRule(state.terrainVersion === 5, '木桥需要真实河道，两端必须接岸');
  requireRule(Array.isArray(sources) && sources.length === 2, '请明确选择两座木栈桥');
  requireRule(sources[0]?.id !== sources[1]?.id, '不能重复使用同一座栈桥');
  const piers = sources.map((source) => {
    requireRule(source && typeof source === 'object', '所选栈桥无效');
    const pier = state.buildings.find((b) => b.id === source.id);
    requireRule(
      pier?.kind === 'woodenPier' &&
        source.kind === pier.kind &&
        source.x === pier.x &&
        source.z === pier.z &&
        source.rotation === pier.rotation,
      '所选栈桥已变化，请重新选择',
    );
    requireRule(!pier.job && !pier.processingJob && !pier.collectionBox, '请先清理栈桥生产状态');
    return pier;
  });
  const [a, b] = piers;
  requireRule(a && b && (a.x === b.x || a.z === b.z), '请将两座栈桥对齐放在河流两岸');
  const alongZ = a.x === b.x,
    near = (alongZ ? a.z <= b.z : a.x <= b.x) ? a : b,
    far = near === a ? b : a,
    length = (alongZ ? far.z - near.z : far.x - near.x) + 2;
  requireRule(
    integer(length, BRIDGE_CROSSING.maximumLength) && length >= BRIDGE_CROSSING.minimumLength,
    '两端间距不适合当前木桥',
  );
  const { occupiedCells, endpointCells, riverCells } = validateBridgeTerrain(state, {
    x: near.x,
    z: near.z,
    rotation: alongZ ? 0 : 1,
    length,
  });
  const keys = new Set(occupiedCells.map((p) => `${p.x},${p.z}`)),
    inside = (p: LandCell) => keys.has(`${p.x},${p.z}`),
    inputIds = new Set(piers.map((p) => p.id));
  requireRule(
    !state.buildings.some(
      (building) => !inputIds.has(building.id) && buildingOccupiedCells(building).some(inside),
    ),
    '桥面或落岸处已有建筑',
  );
  requireRule(!state.trees.some(inside), '请先清理落岸处的树木');
  requireRule(!state.naturalResources.some(inside), '请先采集落岸处的天然资源');
  requireRule(!state.groundStacks.some(inside), '请先移开桥面位置的材料堆');
  requireRule(
    !state.looseDrops.some((p) => inside({ x: Math.floor(p.x6 / 6), z: Math.floor(p.z6 / 6) })),
    '请先移开桥面位置的掉落物',
  );
  requireRule(!state.landExtensions.some(inside), '木桥不可覆盖已填土地块');
  requireRule(
    piers.reduce((n, p) => {
      const stock = state.fusion.attachments[p.id];
      return n + (stock ? stockTotal(stock) : 0);
    }, 0) <= 5,
    '两座栈桥的挂载物品超过容量，请先取回',
  );
  return {
    retainedId: near.id,
    consumedId: far.id,
    x: near.x,
    z: near.z,
    rotation: alongZ ? 0 : 1,
    width: 2,
    length,
    endpointCells,
    riverCells,
    occupiedCells,
  };
}
