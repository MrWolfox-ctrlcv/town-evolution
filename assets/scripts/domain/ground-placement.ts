import { v6ExposedResource } from './v6-edit-surface';
import type { GameState } from './types';
import { worldSize } from './world';
import { isLandCell } from './island';
import { buildingOccupiesCell } from './building-cells';
import { integer, requireRule } from './guards';
/** Shared regular-pile placement contract, including occupied field-box and loose-drop tiles. */
export function assertGroundCell(s: GameState, x: number, z: number, ignoredDropId?: string): void {
  requireRule(
    integer(x, worldSize(s.terrainVersion) - 1) && integer(z, worldSize(s.terrainVersion) - 1),
    '请选择地图内的地块',
  );
  requireRule(isLandCell(x, z, s.mapSeed, s.terrainVersion, s.landExtensions), '此处是水域');
  requireRule(
    !s.looseDrops.some(
      (d) => d.id !== ignoredDropId && Math.floor(d.x6 / 6) === x && Math.floor(d.z6 / 6) === z,
    ),
    '请先移动此处其它掉落物',
  );
  requireRule(!s.trees.some((p) => p.x === x && p.z === z), '此地块有树木');
  requireRule(
    s.terrainVersion === 6
      ? !v6ExposedResource(s, x, z)
      : !s.naturalResources.some((p) => p.x === x && p.z === z),
    '请先采集此处的天然资源',
  );
  requireRule(!s.buildings.some((b) => buildingOccupiesCell(b, x, z)), '此地块有建筑');
}
