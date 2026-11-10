import { MAX_SAVE_CHARACTERS } from './save-limits';
import { SaveVersionError } from './save-version';
import { V7_GENERATOR_REVISION } from './v7-world';
import { integer, requireRule } from './guards';
/** Header only: full import and prepared-world validation remain mandatory. */
export function peekTerrain7Save(text: string): {
  mapSeed: number;
  terrainVersion: 7;
  terrainRevision: string;
} {
  requireRule(typeof text === 'string' && text.length <= MAX_SAVE_CHARACTERS, '存档过大或格式无效');
  const data = JSON.parse(text) as Record<string, unknown>;
  requireRule(data && typeof data === 'object' && !Array.isArray(data), '存档结构无效');
  if (
    data.schemaVersion !== 12 ||
    data.terrainVersion !== 7 ||
    data.terrainRevision !== V7_GENERATOR_REVISION
  )
    throw new SaveVersionError('随机海岸存档版本不兼容，原始数据未更改');
  requireRule(
    integer(data.mapSeed) && data.mapSeed > 0 && data.mapSeed <= 1_000_000_000,
    '地图种子无效',
  );
  return { mapSeed: data.mapSeed, terrainVersion: 7, terrainRevision: V7_GENERATOR_REVISION };
}

export function assertTerrain7SlotIdentity(data: Record<string, unknown>): void {
  if (
    data.format !== 1 ||
    data.terrainVersion !== 7 ||
    data.terrainRevision !== V7_GENERATOR_REVISION
  )
    throw new SaveVersionError('随机海岸栏位版本不兼容，原始数据未更改');
}
