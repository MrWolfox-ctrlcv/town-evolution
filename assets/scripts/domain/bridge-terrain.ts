import type { GameState, LandCell } from './types';
import type { BridgePlacement } from './bridge-types';
import { getEditableWorld } from './editable-world';
import { v6BridgeProfile } from './v6-bridge-profile';
import { getV5Hydrology } from './v5-hydrology';
import { integer, requireRule } from './guards';
/** Provisional safety limits, not a promise that every river reach can support a bridge. */
export const BRIDGE_CROSSING = { width: 2, minimumLength: 7, maximumLength: 16 } as const;
export interface BridgeTerrainPlan {
  endpointCells: LandCell[];
  riverCells: LandCell[];
  occupiedCells: LandCell[];
  baseElevation?: number;
}
export function bridgeSpanCells(p: BridgePlacement): LandCell[] {
  requireRule(integer(p.x, 191) && integer(p.z, 191), '木桥起点无效');
  requireRule(
    integer(p.length, BRIDGE_CROSSING.maximumLength) && p.length >= BRIDGE_CROSSING.minimumLength,
    '木桥跨度无效',
  );
  requireRule([0, 1, 2, 3].includes(p.rotation), '木桥朝向无效');
  const alongZ = p.rotation % 2 === 0;
  return Array.from({ length: p.length * 2 }, (_, index) => {
    const i = Math.floor(index / 2),
      side = index % 2;
    return { x: p.x + (alongZ ? side : i), z: p.z + (alongZ ? i : side) };
  });
}
/** Same hydrology certificate for preview, assembly, relocation and saved bridges. */
export function validateBridgeTerrain(
  state: Pick<GameState, 'mapSeed' | 'terrainVersion' | 'landExtensions'> &
    Partial<Pick<GameState, 'terrain6'>>,
  p: BridgePlacement,
): BridgeTerrainPlan {
  requireRule(
    state.terrainVersion === 5 || state.terrainVersion === 6 || state.terrainVersion === 7,
    '木桥需要真实河道，两端必须接岸',
  );
  const occupiedCells = bridgeSpanCells(p),
    hydro =
      state.terrainVersion === 6 || state.terrainVersion === 7
        ? getEditableWorld(state.mapSeed, state.terrainVersion).hydrology
        : getV5Hydrology(state.mapSeed),
    endpointCells: LandCell[] = [],
    riverCells: LandCell[] = [];
  for (let side = 0; side < 2; side++) {
    const riverIndices: number[] = [],
      dryIndices: number[] = [];
    for (let i = 0; i < p.length; i++) {
      const point = occupiedCells[i * 2 + side]!,
        cell = hydro.at(point.x, point.z);
      requireRule(
        cell &&
          point.x >= 1 &&
          point.z >= 1 &&
          point.x < hydro.size - 1 &&
          point.z < hydro.size - 1,
        '桥面超出地图',
      );
      const f = hydro.fields(point.x + 0.5, point.z + 0.5);
      requireRule(
        f.ocean + Math.SQRT1_2 < -(state.terrainVersion === 7 ? 1e-5 : 0) &&
          f.lake + Math.SQRT1_2 < -(state.terrainVersion === 7 ? 1e-5 : 0),
        '此处不是可跨越的独立河段',
      );
      if (i < 2 || i >= p.length - 2) {
        requireRule(cell.state === 'dryBuildable', '木桥两端都必须落在完整干岸上');
        endpointCells.push(point);
      } else {
        if (cell.state === 'dryBuildable') dryIndices.push(i);
        requireRule(
          cell.waterKind === null || cell.waterKind === 'river',
          '木桥只能跨越河流，不能连接湖面或海面',
        );
        if (
          cell.state === 'clearWater' &&
          cell.waterKind === 'river' &&
          cell.freshLower >= (state.terrainVersion === 7 ? 1e-5 : 0)
        ) {
          riverIndices.push(i);
          riverCells.push(point);
        }
      }
    }
    requireRule(riverIndices.length >= 2, '两端之间没有足够的真实河面');
    requireRule(
      !dryIndices.some((i) => i > riverIndices[0]! && i < riverIndices[riverIndices.length - 1]!),
      '桥面不能越过河中陆地再跨另一段水面',
    );
  }
  const occupied = new Set(occupiedCells.map((cell) => `${cell.x},${cell.z}`));
  requireRule(
    !state.landExtensions.some((cell) => occupied.has(`${cell.x},${cell.z}`)),
    '木桥不可覆盖已填土地块',
  );
  if (state.terrainVersion === 6 || state.terrainVersion === 7) {
    requireRule(
      !state.terrain6?.cells.some((c) => occupied.has(`${c.x},${c.z}`)),
      '木桥不可覆盖已挖填地块',
    );
    return {
      endpointCells,
      riverCells,
      occupiedCells,
      baseElevation: v6BridgeProfile(state.mapSeed, p, state.terrainVersion).root,
    };
  }
  return { endpointCells, riverCells, occupiedCells };
}
