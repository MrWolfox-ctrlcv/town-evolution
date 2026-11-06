import { MAX_SAVE_CHARACTERS } from './save-limits';
import { SaveVersionError } from './save-version';
import { V6_GENERATOR_REVISION } from './v6-world';
import { integer, requireRule } from './guards';
export const V6_SAVE_MAX_CHARACTERS = MAX_SAVE_CHARACTERS;
/** Preparation hint only. A successful header is never a substitute for full importSave validation. */
export function peekTerrain6Save(
  text: string,
): { mapSeed: number; terrainVersion: 6; terrainRevision: string } | null {
  requireRule(
    typeof text === 'string' && text.length <= V6_SAVE_MAX_CHARACTERS,
    '存档过大或格式无效',
  );
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw Error('存档不是有效 JSON');
  }
  requireRule(raw && typeof raw === 'object' && !Array.isArray(raw), '存档结构无效');
  const value = raw as Record<string, unknown>;
  if (value.terrainVersion !== 6) return null;
  if (value.schemaVersion !== 10 || value.terrainRevision !== V6_GENERATOR_REVISION)
    throw new SaveVersionError('此 v6 地形版本不兼容，请保留原始存档；不会重新生成或重解释旧数据');
  requireRule(integer(value.mapSeed) && value.mapSeed > 0, '地图种子无效');
  return { mapSeed: value.mapSeed, terrainVersion: 6, terrainRevision: V6_GENERATOR_REVISION };
}
