import { SaveVersionError } from './save-version';
import { parseTerrain6 } from './v6-save';
import { V5_GENERATOR_REVISION } from './v5-world';
import { V6_GENERATOR_REVISION } from './v6-world';
import { V7_GENERATOR_REVISION } from './v7-world';
import { integer, requireRule } from './guards';
/** Public wire identity is checked before ordinary corruption can enable backup recovery. */
export function parseSaveWorldHeader(data: Record<string, unknown>) {
  const version = data.schemaVersion;
  if (version !== 8 && version !== 9 && version !== 10 && version !== 11 && version !== 12)
    throw new SaveVersionError('不支持此存档版本，请保留备份');
  // Wire 11 adds only the two decorative kinds/discoveries. Normalize before the existing
  // strict schema10 parsers so no legacy optional-field defaults are enabled.
  if (
    (version === 12) !== (data.terrainVersion === 7) ||
    (data.terrainVersion === 7 && data.terrainRevision !== V7_GENERATOR_REVISION)
  )
    throw new SaveVersionError('随机海岸存档版本不兼容，请保留原始数据');
  const sourceVersion = version === 11 || version === 12 ? 10 : version;
  if (sourceVersion >= 9)
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
      terrainVersion === 5 ||
      terrainVersion === 6 ||
      terrainVersion === 7,
    '地图版本无效',
  );
  if (terrainVersion === 5 && data.terrainRevision !== V5_GENERATOR_REVISION)
    throw new SaveVersionError(
      '此 v5 预览地形版本不兼容，请保留原始存档；不会重新生成或重解释旧数据',
    );
  if (
    terrainVersion === 6 &&
    (sourceVersion !== 10 || data.terrainRevision !== V6_GENERATOR_REVISION)
  )
    throw new SaveVersionError('此 v6 地形版本不兼容，请保留原始存档；不会重新生成或重解释旧数据');
  requireRule(terrainVersion >= 6 || data.terrain6 === undefined, '旧地图不能包含v6地形记录');
  const terrain6 =
    terrainVersion >= 6
      ? parseTerrain6(data.terrain6, data.mapSeed, terrainVersion === 7 ? 7 : 6)
      : undefined;
  return { sourceVersion, terrainVersion, terrain6 } as const;
}
