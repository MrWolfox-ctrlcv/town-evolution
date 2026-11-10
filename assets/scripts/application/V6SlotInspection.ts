import { hasPreparedV6World } from '../domain/v6-world';
import { peekTerrain6Save } from '../domain/v6-save-header';
import type { KeyValueStorage } from '../domain/storage';
import { SAVE_KEY } from '../domain/storage';
import { inspectSlotRaw, manualSlotKey, MAX_MANUAL_SAVE_CHARACTERS } from './ManualSaves';
import type { ManualSlot, SlotInfo } from './ManualSaves';
export type StartSlotInfo =
  | SlotInfo
  | {
      status: 'pending';
      state: null;
      savedAt: number;
      revision: string;
    };
export function v6SlotHeader(raw: string): { seed: number; savedAt: number } {
  if (raw.length > MAX_MANUAL_SAVE_CHARACTERS) throw Error('存档栏位过大');
  const data: unknown = JSON.parse(raw);
  if (
    !data ||
    typeof data !== 'object' ||
    !('format' in data) ||
    data.format !== 1 ||
    !('save' in data) ||
    typeof data.save !== 'string' ||
    !('savedAt' in data) ||
    typeof data.savedAt !== 'number' ||
    !Number.isSafeInteger(data.savedAt) ||
    data.savedAt < 0
  )
    throw Error('存档栏位格式无效');
  const header = peekTerrain6Save(data.save);
  if (!header) throw Error('此栏位不是自然挖填实验存档');
  return { seed: header.mapSeed, savedAt: data.savedAt };
}
export function inspectV6Slot(
  storage: KeyValueStorage,
  slot: ManualSlot,
  now: number,
): StartSlotInfo {
  let raw: string | null | undefined;
  try {
    raw = storage.getItem(manualSlotKey(slot));
    if (raw === null) return { status: 'empty', state: null, savedAt: null, revision: raw };
    const header = v6SlotHeader(raw);
    if (!hasPreparedV6World(header.seed))
      return { status: 'pending', state: null, savedAt: header.savedAt, revision: raw };
    return inspectSlotRaw(raw, now);
  } catch {
    return {
      status: 'corrupt',
      state: null,
      savedAt: null,
      ...(raw !== undefined ? { revision: raw } : {}),
    };
  }
}
/** Unprepared compatible backup is an available verification action, never a corrupt slot. */
export function v6BackupPending(storage: KeyValueStorage): boolean {
  try {
    const raw = storage.getItem(`${SAVE_KEY}.backup`);
    const header = raw === null ? null : peekTerrain6Save(raw);
    return header !== null && !hasPreparedV6World(header.mapSeed);
  } catch {
    return false;
  }
}
