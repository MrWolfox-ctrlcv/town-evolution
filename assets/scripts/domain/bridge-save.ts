import type { BridgeState, BridgePierSnapshot, GameState } from './types';
import { BRIDGE_CROSSING, validateBridgeTerrain } from './bridge-terrain';
import { integer, requireRule } from './guards';
function exact(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  requireRule(raw !== null && typeof raw === 'object' && !Array.isArray(raw), '木桥记录无效');
  const value = raw as Record<string, unknown>;
  requireRule(
    Object.keys(value).length === keys.length &&
      keys.every((k) => Object.prototype.hasOwnProperty.call(value, k)),
    '木桥记录含未知或缺失字段',
  );
  return value;
}
export function parseBridgeState(
  raw: unknown,
  ownerId: string,
  world: Pick<GameState, 'mapSeed' | 'terrainVersion' | 'landExtensions'>,
  acceptId: (id: unknown, prefix: string) => string,
): BridgeState {
  const value = exact(raw, ['length', 'piers']);
  requireRule(
    integer(value.length, BRIDGE_CROSSING.maximumLength) &&
      value.length >= BRIDGE_CROSSING.minimumLength,
    '木桥跨度无效',
  );
  requireRule(Array.isArray(value.piers) && value.piers.length === 2, '木桥须保留两座栈桥来源');
  const piers = value.piers.map((entry) => {
    const p = exact(entry, ['id', 'kind', 'x', 'z', 'rotation']);
    requireRule(
      typeof p.id === 'string' &&
        /^b[1-9][0-9]{0,8}$/.test(p.id) &&
        p.kind === 'woodenPier' &&
        integer(p.x, 191) &&
        integer(p.z, 191) &&
        [0, 1, 2, 3].includes(p.rotation as number),
      '木桥来源记录无效',
    );
    return {
      id: p.id,
      kind: 'woodenPier',
      x: p.x,
      z: p.z,
      rotation: p.rotation,
    } as BridgePierSnapshot;
  }) as [BridgePierSnapshot, BridgePierSnapshot];
  const [near, far] = piers;
  requireRule(near.id === ownerId && far.id !== ownerId, '木桥来源身份冲突');
  const alongZ = near.x === far.x;
  requireRule(
    (alongZ && far.z > near.z) || (near.z === far.z && far.x > near.x),
    '木桥来源两端不对齐',
  );
  requireRule(
    (alongZ ? far.z - near.z : far.x - near.x) + 2 === value.length,
    '木桥长度与来源跨度不一致',
  );
  validateBridgeTerrain(world, {
    x: near.x,
    z: near.z,
    rotation: alongZ ? 0 : 1,
    length: value.length,
  });
  piers[1].id = acceptId(far.id, 'b');
  return { length: value.length, piers };
}
