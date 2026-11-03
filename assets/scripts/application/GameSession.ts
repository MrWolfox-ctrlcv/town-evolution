import { collectionGains } from './Collections';
import type { CollectionEvent } from './Collections';
import { createGame, dispatch, advance } from '../domain/game';
import type { GameState, Command } from '../domain/game';
import { loadGame, saveGame, acceptRecovery, resetSave } from '../domain/storage';
import type { KeyValueStorage } from '../domain/storage';
/** Owns game state and persistence. Views never mutate domain objects. */
export class GameSession {
  state: GameState;
  mode: 'normal' | 'recovered' | 'corrupt' = 'normal';
  message = '';
  private saveWarning = '';
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
    if (result.status === 'recovered' || result.status === 'corrupt') this.mode = result.status;
    if (result.warning) this.message = result.warning;
  }
  reason(command: Command): string | null {
    if (this.mode !== 'normal')
      return this.mode === 'recovered' ? '先采用备份存档' : '存档损坏，请确认恢复或新局';
    const result = dispatch(this.state, command, this.now());
    return result.ok ? null : result.error;
  }
  run(command: Command): boolean {
    const reason = this.reason(command);
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
    if (this.mode !== 'normal') {
      this.message =
        this.mode === 'recovered'
          ? '点击“采用备份”确认恢复，原始数据会保留。'
          : '已暂停写入，防止覆盖损坏存档。';
      return false;
    }
    try {
      saveGame(this.storage, this.state);
      if (this.saveWarning && this.message.startsWith('保存失败')) this.message = '已保存';
      this.saveWarning = '';
      return true;
    } catch (error) {
      this.saveWarning = '保存失败，暂勿退出 · 工具页可重试';
      this.message = `保存失败，暂勿退出：${String(error)}`;
      return false;
    }
  }
  recover(): void {
    try {
      acceptRecovery(this.storage, this.state);
      this.saveWarning = '';
      this.mode = 'normal';
      this.message = '已采用备份，原始存档另存保留。';
    } catch (error) {
      this.message = `恢复失败：${String(error)}`;
    }
  }
  reset(): boolean {
    const initial = this.initial();
    try {
      resetSave(this.storage, initial);
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
