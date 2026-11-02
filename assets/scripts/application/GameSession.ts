import { createGame, dispatch, advance } from '../domain/game';
import type { GameState, Command } from '../domain/game';
import { loadGame, saveGame, acceptRecovery, resetSave } from '../domain/storage';
import type { KeyValueStorage } from '../domain/storage';
/** Owns game state and persistence. Views never mutate domain objects. */
export class GameSession {
  state: GameState;
  mode: 'normal' | 'recovered' | 'corrupt' = 'normal';
  message = '点选菜地开始种植，收获后交订单赚取建设资金。';
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => number,
  ) {
    const result = loadGame(this.storage, this.now());
    this.state = result.state ?? createGame(this.now());
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
    this.state = result.state;
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
      return true;
    } catch (error) {
      this.message = `保存失败，暂勿退出：${String(error)}`;
      return false;
    }
  }
  recover(): void {
    try {
      acceptRecovery(this.storage, this.state);
      this.mode = 'normal';
      this.message = '已采用备份，原始存档另存保留。';
    } catch (error) {
      this.message = `恢复失败：${String(error)}`;
    }
  }
  reset(): boolean {
    const initial = createGame(this.now());
    try {
      resetSave(this.storage, initial);
      this.state = initial;
      this.mode = 'normal';
      this.message = '新小镇已创建，原始存档另存保留。';
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
