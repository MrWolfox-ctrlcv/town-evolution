import { exportSave, importSave, SaveVersionError } from './save';
import type { GameState } from './types';
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type LoadResult =
  | { status: 'empty' | 'corrupt'; state: null; warning?: string }
  | { status: 'loaded' | 'recovered'; state: GameState; warning?: string };
export const SAVE_KEY = 'town-evolution.save.v1';
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
/** Both web/native use this adapter via Cocos sys.localStorage. Storage errors are surfaced. */
export function loadGame(storage: KeyValueStorage, now: number): LoadResult {
  try {
    const primary = storage.getItem(SAVE_KEY);
    if (primary !== null) {
      try {
        return { status: 'loaded', state: importSave(primary, now) };
      } catch (error) {
        if (error instanceof SaveVersionError)
          return {
            status: 'corrupt',
            state: null,
            warning: '主存档版本不兼容。请用对应游戏版本打开，尚未回退或覆盖存档。',
          };
      }
    }
    const backup = storage.getItem(BACKUP_KEY);
    if (primary === null && backup === null) return { status: 'empty', state: null };
    if (backup !== null) {
      try {
        return {
          status: 'recovered',
          state: importSave(backup, now),
          warning: '主存档不可用，已读取备份。原始文件未删除。',
        };
      } catch {
        /* Never overwrite invalid data silently. */
      }
    }
    return {
      status: 'corrupt',
      state: null,
      warning: '存档无法读取，尚未覆盖。可在工具面板确认新局；最近一次重置前的主存档会另存保留。',
    };
  } catch {
    return { status: 'corrupt', state: null, warning: '无法访问本地存储。进度尚未保存。' };
  }
}
export function saveGame(storage: KeyValueStorage, state: GameState): void {
  const encoded = exportSave(state);
  const previous = storage.getItem(SAVE_KEY);
  if (previous !== null) {
    // Invalid primary remains recoverable as raw text rather than silently replaced.
    try {
      importSave(previous, state.lastSeenAt);
    } catch {
      throw new Error('主存档损坏，尚未覆盖。请先采用有效备份，或确认新局后再保存。');
    }
    storage.setItem(BACKUP_KEY, previous);
  }
  storage.setItem(SAVE_KEY, encoded);
}
/** Explicit recovery action only; preserves the unreadable primary in a separate key. */
export function acceptRecovery(storage: KeyValueStorage, state: GameState): void {
  const encoded = exportSave(state),
    previous = storage.getItem(SAVE_KEY);
  if (previous !== null) storage.setItem(`${SAVE_KEY}.unreadable`, previous);
  storage.setItem(SAVE_KEY, encoded);
}
/** Caller MUST ask for a second explicit confirmation before reset. */
export function resetSave(storage: KeyValueStorage, initial: GameState): void {
  const encoded = exportSave(initial),
    previous = storage.getItem(SAVE_KEY);
  if (previous !== null) storage.setItem(`${SAVE_KEY}.before-reset`, previous);
  storage.setItem(SAVE_KEY, encoded);
  // Keep backup and before-reset recovery copies; a reset does not permanently erase them.
}
