import { V7_GENERATOR_REVISION } from '../domain/v7-world';
import { peekTerrain7Save, assertTerrain7SlotIdentity } from '../domain/v7-save-header';
import { exportSave, importSave, MAX_SAVE_CHARACTERS, SaveVersionError } from '../domain/save';
import { MAX_TIME } from '../domain/config';
import type { GameState } from '../domain/game';
import { SAVE_KEY, SaveConflictError, guardTerrain7Overwrite } from '../domain/storage';
import type { KeyValueStorage } from '../domain/storage';
export const MANUAL_SLOTS = [1, 2, 3] as const;
export type ManualSlot = (typeof MANUAL_SLOTS)[number];
// A canonical save is a JSON string inside the slot JSON: each quote/backslash can double.
// The small fixed envelope includes format, savedAt (at most 16 digits), and save keys.
export const MAX_MANUAL_SAVE_CHARACTERS = MAX_SAVE_CHARACTERS * 2 + 160;
export type SlotInfo = (
  | { status: 'empty' | 'corrupt'; state: null; savedAt: null }
  | { status: 'ready'; state: GameState; savedAt: number }
) & { revision?: string | null };
export const manualSlotKey = (slot: ManualSlot) => {
  if (!MANUAL_SLOTS.includes(slot)) throw new Error('无效的存档栏位');
  return `${SAVE_KEY}.manual.${slot}`;
};
/** Read-only inspection. Broken slot bytes are never treated as an empty slot. */
export function inspectSlot(storage: KeyValueStorage, slot: ManualSlot, now: number): SlotInfo {
  try {
    const raw = storage.getItem(manualSlotKey(slot));
    return inspectSlotRaw(raw, now);
  } catch {
    return { status: 'corrupt', state: null, savedAt: null };
  }
}
/** Header checks and full validation must inspect the same immutable slot snapshot. */
export function inspectSlotRaw(raw: string | null, now: number): SlotInfo {
  try {
    if (raw === null) return { status: 'empty', state: null, savedAt: null, revision: raw };
    if (raw.length > MAX_MANUAL_SAVE_CHARACTERS) throw new Error('存档栏位过大');
    const data: unknown = JSON.parse(raw);
    if (
      !data ||
      typeof data !== 'object' ||
      !('format' in data) ||
      data.format !== 1 ||
      !('savedAt' in data) ||
      typeof data.savedAt !== 'number' ||
      !Number.isSafeInteger(data.savedAt) ||
      data.savedAt < 0 ||
      data.savedAt > MAX_TIME ||
      !('save' in data) ||
      typeof data.save !== 'string'
    )
      throw new Error('存档栏位格式无效');
    const state = importSave(data.save, now);
    if (
      state.terrainVersion === 7 &&
      (!('terrainVersion' in data) ||
        data.terrainVersion !== 7 ||
        !('terrainRevision' in data) ||
        data.terrainRevision !== V7_GENERATOR_REVISION)
    )
      throw Error('栏位身份不匹配');
    if (state.terrainVersion !== 7 && ('terrainVersion' in data || 'terrainRevision' in data))
      throw Error('栏位身份不匹配');
    return {
      status: 'ready',
      state,
      savedAt: data.savedAt,
      revision: raw,
    };
  } catch {
    return { status: 'corrupt', state: null, savedAt: null, revision: raw };
  }
}
/** The caller confirms replacement first. The previous slot is preserved before writing. */
export function writeSlot(
  storage: KeyValueStorage,
  slot: ManualSlot,
  state: GameState,
  savedAt: number,
  expected?: string | null,
): void {
  if (!Number.isSafeInteger(savedAt) || savedAt < 0 || savedAt > MAX_TIME)
    throw new Error('存档时间无效');
  const key = manualSlotKey(slot);
  const encoded = JSON.stringify({
    format: 1,
    savedAt,
    ...(state.terrainVersion === 7
      ? { terrainVersion: 7, terrainRevision: V7_GENERATOR_REVISION }
      : {}),
    save: exportSave(state),
  });
  if (encoded.length > MAX_MANUAL_SAVE_CHARACTERS) throw new Error('存档栏位过大');
  const previous = storage.getItem(key);
  if (expected !== undefined && previous !== expected) throw new SaveConflictError();
  if (previous !== null && state.terrainVersion === 7) {
    try {
      const envelope = JSON.parse(previous);
      assertTerrain7SlotIdentity(envelope);
      peekTerrain7Save(envelope.save);
    } catch (error) {
      if (error instanceof SaveVersionError) throw error;
    }
  }
  const archiveKey = `${key}.before-overwrite`;
  const guardArchive =
    state.terrainVersion === 7 && previous !== null
      ? guardTerrain7Overwrite(storage, archiveKey, true)
      : undefined;
  if (previous !== null) {
    if (state.terrainVersion === 7 && storage.getItem(key) !== previous)
      throw new SaveConflictError();
    guardArchive?.();
    storage.setItem(archiveKey, previous);
  }
  if (guardArchive && storage.getItem(archiveKey) !== previous) throw new SaveConflictError();
  if (storage.getItem(key) !== previous) throw new SaveConflictError();
  storage.setItem(key, encoded);
}
