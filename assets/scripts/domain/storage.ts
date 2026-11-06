import { exportSave, importSave, SaveVersionError } from './save';
import type { GameState } from './types';
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface SaveRevision {
  readonly primary: string | null;
  readonly backup?: string | null;
}
export class SaveConflictError extends Error {
  constructor() {
    super('另一页面已更新此存档，已暂停写入，当前页面进度仍保留。');
  }
}
export type LoadResult = (
  | { status: 'empty' | 'corrupt'; state: null; warning?: string }
  | { status: 'loaded' | 'recovered'; state: GameState; warning?: string }
) & { revision?: SaveRevision };
export const SAVE_KEY = 'town-evolution.save.v1';
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
export const MIGRATION_BACKUP_KEY = `${SAVE_KEY}.before-schema9`;
export const SCHEMA10_BACKUP_KEY = `${SAVE_KEY}.before-schema10`;
export const GAME_SAVE_KEYS = [
  SAVE_KEY,
  BACKUP_KEY,
  MIGRATION_BACKUP_KEY,
  SCHEMA10_BACKUP_KEY,
  `${SAVE_KEY}.before-reset`,
  `${SAVE_KEY}.unreadable`,
] as const;
/** Both web/native use this adapter via Cocos sys.localStorage. Storage errors are surfaced. */
export function loadGame(storage: KeyValueStorage, now: number): LoadResult {
  try {
    const primary = storage.getItem(SAVE_KEY);
    if (primary !== null) {
      try {
        return { status: 'loaded', state: importSave(primary, now), revision: { primary } };
      } catch (error) {
        if (error instanceof SaveVersionError)
          return {
            status: 'corrupt',
            state: null,
            revision: { primary },
            warning: '主存档版本不兼容。请用对应游戏版本打开，尚未回退或覆盖存档。',
          };
      }
    }
    const backup = storage.getItem(BACKUP_KEY);
    const revision = { primary, backup };
    if (primary === null && backup === null) return { status: 'empty', state: null, revision };
    if (backup !== null) {
      try {
        return {
          status: 'recovered',
          state: importSave(backup, now),
          revision,
          warning: '主存档不可用，已读取备份。原始文件未删除。',
        };
      } catch {
        /* Never overwrite invalid data silently. */
      }
    }
    return {
      status: 'corrupt',
      state: null,
      revision,
      warning: '存档无法读取，尚未覆盖。可在工具面板确认新局；最近一次重置前的主存档会另存保留。',
    };
  } catch {
    return { status: 'corrupt', state: null, warning: '无法访问本地存储。进度尚未保存。' };
  }
}
/** Exact bytes, not timestamps: two different states may be saved in the same millisecond. */
export function assertSaveRevision(storage: KeyValueStorage, expected: SaveRevision): void {
  if (
    storage.getItem(SAVE_KEY) !== expected.primary ||
    (expected.backup !== undefined && storage.getItem(BACKUP_KEY) !== expected.backup)
  )
    throw new SaveConflictError();
}
/** Archive exact source bytes before either a normal migration write or backup recovery. */
function preserveMigrationBytes(
  storage: KeyValueStorage,
  source: string,
  revision: SaveRevision,
): void {
  const version = JSON.parse(source).schemaVersion;
  const keys =
    version === 8
      ? [MIGRATION_BACKUP_KEY, SCHEMA10_BACKUP_KEY]
      : version === 9
        ? [SCHEMA10_BACKUP_KEY]
        : [];
  for (const key of keys) {
    if (storage.getItem(key) !== null) continue;
    storage.setItem(key, source);
    assertSaveRevision(storage, revision);
  }
}
export function saveGame(
  storage: KeyValueStorage,
  state: GameState,
  expected?: SaveRevision,
): SaveRevision {
  const encoded = exportSave(state);
  const previous = storage.getItem(SAVE_KEY);
  const revision = expected ?? { primary: previous };
  assertSaveRevision(storage, revision);
  if (expected && previous === encoded) return { primary: encoded };
  if (previous !== null) {
    // Invalid primary remains recoverable as raw text rather than silently replaced.
    try {
      importSave(previous, state.lastSeenAt);
    } catch {
      throw new Error('主存档损坏，尚未覆盖。请先采用有效备份，或确认新局后再保存。');
    }
    assertSaveRevision(storage, revision);
    preserveMigrationBytes(storage, previous, revision);
    storage.setItem(BACKUP_KEY, previous);
  }
  assertSaveRevision(storage, { primary: revision.primary });
  storage.setItem(SAVE_KEY, encoded);
  return { primary: encoded };
}
/** Explicit recovery action only; preserves the unreadable primary in a separate key. */
export function acceptRecovery(
  storage: KeyValueStorage,
  state: GameState,
  expected?: SaveRevision,
): SaveRevision {
  const encoded = exportSave(state),
    previous = storage.getItem(SAVE_KEY),
    backup = storage.getItem(BACKUP_KEY);
  const revision = expected ?? { primary: previous, backup };
  assertSaveRevision(storage, revision);
  if (backup !== null) {
    importSave(backup, state.lastSeenAt);
    preserveMigrationBytes(storage, backup, revision);
  }
  if (previous !== null) storage.setItem(`${SAVE_KEY}.unreadable`, previous);
  assertSaveRevision(storage, revision);
  storage.setItem(SAVE_KEY, encoded);
  return { primary: encoded };
}
/** Caller MUST ask for a second explicit confirmation before reset. */
export function resetSave(
  storage: KeyValueStorage,
  initial: GameState,
  expected?: SaveRevision,
): SaveRevision {
  const encoded = exportSave(initial),
    previous = storage.getItem(SAVE_KEY);
  const revision = expected ?? { primary: previous };
  assertSaveRevision(storage, revision);
  if (previous !== null) storage.setItem(`${SAVE_KEY}.before-reset`, previous);
  assertSaveRevision(storage, revision);
  storage.setItem(SAVE_KEY, encoded);
  // Keep backup and before-reset recovery copies; a reset does not permanently erase them.
  return { primary: encoded };
}
