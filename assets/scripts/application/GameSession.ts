import { collectionGains } from './Collections';
import type { CollectionEvent } from './Collections';
import { createGame, dispatch, advance } from '../domain/game';
import type { GameState, Command, Result } from '../domain/game';
import {
  loadGame,
  saveGame,
  acceptRecovery,
  resetSave,
  SaveConflictError,
  assertSaveRevision,
} from '../domain/storage';
import type { KeyValueStorage, SaveRevision } from '../domain/storage';
/** Owns game state and persistence. Views never mutate domain objects. */
export class GameSession {
  state: GameState;
  mode: 'normal' | 'recovered' | 'corrupt' = 'normal';
  message = '';
  private saveWarning = '';
  private revision: SaveRevision | undefined;
  private conflict = false;
  get hasSaveConflict(): boolean {
    return this.conflict;
  }
  get saveRevision(): SaveRevision {
    if (!this.revision) throw new Error('无法核对本机存档，请重新打开存档页。');
    return this.revision;
  }
  private conflictWarning(error: unknown): boolean {
    if (!(error instanceof SaveConflictError)) return false;
    this.conflict = true;
    this.saveWarning = '另一页面已更新存档，本页已暂停保存。可先存入空手动栏位，再读取最新进度。';
    this.message = this.saveWarning;
    return true;
  }
  private collectionListener: ((event: CollectionEvent) => void) | null = null;
  setCollectionListener(listener: ((event: CollectionEvent) => void) | null): void {
    this.collectionListener = listener;
  }
  get statusMessage(): string {
    return this.saveWarning || this.message;
  }
  get hasUnsavedChanges(): boolean {
    return Boolean(this.saveWarning);
  }
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => number,
    private readonly initial: () => GameState = () => createGame(now()),
    private readonly afterReset: () => void = () => {},
  ) {
    const result = loadGame(this.storage, this.now());
    this.state = result.state ?? this.initial();
    this.revision = result.revision;
    if (result.status === 'recovered' || result.status === 'corrupt') this.mode = result.status;
    if (result.warning) this.message = result.warning;
  }
  private blockedReason(): string | null {
    if (this.conflict) return this.saveWarning;
    if (this.mode !== 'normal')
      return this.mode === 'recovered' ? '先采用备份存档' : '存档损坏，请确认恢复或新局';
    return null;
  }
  /** Fresh advisory result only. run never consumes or caches a preview snapshot. */
  preview(command: Command): Result {
    const blocked = this.blockedReason();
    if (blocked) return { ok: false, state: this.state, error: blocked };
    return dispatch(this.state, command, this.now());
  }
  reason(command: Command): string | null {
    const result = this.preview(command);
    return result.ok ? null : result.error;
  }
  run(command: Command): boolean {
    if (this.mode === 'normal' && !this.conflict) {
      try {
        assertSaveRevision(this.storage, this.saveRevision);
      } catch (error) {
        if (this.conflictWarning(error)) return false;
        // Ordinary storage denial still permits in-memory play and surfaces on save.
      }
    }
    // Preview and commit have the same gate, but a commit dispatches only once.
    const reason = this.blockedReason();
    if (reason) {
      this.message = reason;
      return false;
    }
    const result = dispatch(this.state, command, this.now());
    if (!result.ok) {
      this.message = result.error;
      return false;
    }
    const before = this.state;
    this.state = result.state;
    const gains = collectionGains(before, this.state);
    if (gains.length) {
      try {
        this.collectionListener?.({ command, before, gains });
      } catch {
        /* Visual feedback must never cancel a committed command. */
      }
    }
    this.message = result.events.join(' · ') || '操作完成';
    this.save();
    return true;
  }
  save(): boolean {
    if (this.conflict) return false;
    if (this.mode !== 'normal') {
      this.message =
        this.mode === 'recovered'
          ? '点击“采用备份”确认恢复，原始数据会保留。'
          : '已暂停写入，防止覆盖损坏存档。';
      return false;
    }
    try {
      this.revision = saveGame(this.storage, this.state, this.saveRevision);
      if (this.saveWarning && this.message.startsWith('保存失败')) this.message = '已保存';
      this.saveWarning = '';
      return true;
    } catch (error) {
      if (this.conflictWarning(error)) return false;
      this.saveWarning = '保存失败，暂勿退出 · 右上设置可重试';
      this.message = `保存失败，暂勿退出：${String(error)}`;
      return false;
    }
  }
  recover(): boolean {
    if (this.conflict) return false;
    try {
      this.revision = acceptRecovery(this.storage, this.state, this.saveRevision);
      this.saveWarning = '';
      this.mode = 'normal';
      this.message = '已采用备份，原始存档另存保留。';
      return true;
    } catch (error) {
      if (this.conflictWarning(error)) return false;
      this.message = `恢复失败：${String(error)}`;
      return false;
    }
  }
  reset(expected?: SaveRevision): boolean {
    if (this.conflict) return false;
    const initial = this.initial();
    try {
      this.revision = resetSave(this.storage, initial, expected ?? this.saveRevision);
      this.saveWarning = '';
      this.state = initial;
      this.mode = 'normal';
      this.message = '新小镇已创建，原始存档另存保留。';
      try {
        this.afterReset();
      } catch {
        this.message = '新海岛已创建，模板版本标记暂未保存。';
      }
      return true;
    } catch (error) {
      if (this.conflictWarning(error)) return false;
      this.message = `重置失败：${String(error)}`;
      return false;
    }
  }
  resume(): void {
    this.state = advance(this.state, this.now());
  }
  suspend(): void {
    this.resume();
    this.save();
  }
}
