import { loadGame, resetSave, SaveConflictError } from '../domain/storage';
import type { KeyValueStorage, LoadResult } from '../domain/storage';
import { townSession, profileStorage, PROFILE_KEY, profileLabel } from './TownProfiles';
import type { TownProfile } from './TownProfiles';
import type { GameSession } from './GameSession';
import { inspectSlot, writeSlot } from './ManualSaves';
import type { ManualSlot, SlotInfo } from './ManualSaves';
export type StartPage = 'title' | 'settings' | 'saves' | 'slot' | 'confirm' | 'exit' | 'game';
type Pending = { text: string; run: () => void; back: StartPage };
/** Owns navigation and explicit save decisions; merely opening the title never writes saves. */
export class GameStart {
  page: StartPage = 'title';
  profile: TownProfile = 'normal';
  session: GameSession | null = null;
  slot: ManualSlot = 1;
  message = '';
  pending: Pending | null = null;
  private savesBack: 'settings' | 'game' = 'game';
  private requestedTownActions = false;
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => number,
    private readonly writeWarning: () => string = () => '',
  ) {}
  get storageWarning(): string {
    return this.writeWarning();
  }
  get returnsToSettings(): boolean {
    return this.page === 'saves' && this.session !== null && this.savesBack === 'settings';
  }
  inspect(profile = this.profile): LoadResult {
    return loadGame(profileStorage(this.storage, profile), this.now());
  }
  inspectSlot(slot = this.slot): SlotInfo {
    return inspectSlot(profileStorage(this.storage, this.profile), slot, this.now());
  }
  start(profile: TownProfile = 'normal'): boolean {
    if (this.storageWarning) {
      this.message = this.storageWarning;
      return false;
    }
    if (this.session) {
      this.page = 'game';
      return true;
    }
    this.profile = profile;
    const session = townSession(this.storage, profile, this.now);
    if (session.mode !== 'normal') {
      this.message = session.statusMessage;
      this.page = 'saves';
      return false;
    }
    if (!session.save()) {
      this.message = session.statusMessage;
      this.page = 'saves';
      return false;
    }
    this.activate(session);
    return true;
  }
  private activate(session: GameSession): void {
    this.requestedTownActions = false;
    this.session = session;
    this.page = 'game';
    this.message = '';
    try {
      this.storage.setItem(PROFILE_KEY, this.profile);
    } catch {
      /* Navigation preference failure never invalidates a saved town. */
    }
  }
  switchTown(profile: TownProfile): void {
    if (this.session && !this.session.save()) {
      this.savesBack = 'game';
      this.message = this.session.statusMessage;
      this.page = 'saves';
      return;
    }
    this.session = null;
    this.start(profile);
  }
  openTownActions(): void {
    if (!this.session || this.storageWarning) return;
    this.requestedTownActions = true;
    this.pending = null;
    this.message = '';
    this.page = 'game';
  }
  consumeTownActions(): boolean {
    const requested = this.requestedTownActions && this.page === 'game' && this.session !== null;
    this.requestedTownActions = false;
    return requested;
  }
  settings(): void {
    if (!this.session) return;
    this.requestedTownActions = false;
    this.message = '';
    this.pending = null;
    this.page = 'settings';
  }
  saves(): void {
    this.requestedTownActions = false;
    this.savesBack = this.page === 'settings' ? 'settings' : 'game';
    this.message = '';
    this.pending = null;
    this.page = 'saves';
  }
  chooseProfile(profile: TownProfile): void {
    if (this.session) return;
    this.profile = profile;
    this.message = '';
    this.page = 'saves';
  }
  chooseSlot(slot: ManualSlot): void {
    this.slot = slot;
    this.message = '';
    this.page = 'slot';
  }
  back(): void {
    this.requestedTownActions = false;
    this.message = '';
    if (this.pending) {
      this.page = this.pending.back;
      this.pending = null;
    } else if (this.page === 'slot') this.page = 'saves';
    else if (this.page === 'saves') this.page = this.session ? this.savesBack : 'title';
    else this.page = this.session ? 'game' : 'title';
  }
  confirm(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.page = pending.back;
    pending.run();
  }
  private ask(text: string, run: () => void): void {
    this.requestedTownActions = false;
    this.pending = { text, run, back: this.page };
    this.page = 'confirm';
  }
  newGame(): void {
    const expected = this.inspect().revision;
    this.ask(
      `重新开始${profileLabel(this.profile)}？当前自动存档会替换，重置前原始数据会另存保留；手动存档不变。`,
      () => {
        if (this.session && !this.session.save()) {
          this.message = this.session.statusMessage;
          return;
        }
        if (!expected) {
          this.message = '无法核对存档，尚未重置。请重新打开存档页。';
          return;
        }
        const session = townSession(this.storage, this.profile, this.now);
        if (!session.reset(this.session?.saveRevision ?? expected)) {
          this.message = session.statusMessage;
          return;
        }
        this.activate(session);
      },
    );
  }
  recover(): void {
    const session = townSession(this.storage, this.profile, this.now);
    this.ask('采用自动备份？无法读取的主存档会另存保留。', () => {
      if (session.mode !== 'recovered') {
        this.message = '备份状态已改变，请重新检查存档。';
        return;
      }
      const recovered = session.recover();
      this.message = session.statusMessage;
      if (recovered) {
        this.activate(session);
      }
    });
  }
  saveNow(): void {
    if (!this.session) return;
    this.session.resume();
    this.message = this.session.save() ? '自动存档已更新。' : this.session.statusMessage;
  }
  saveSlot(): void {
    if (!this.session) return;
    const snapshot = this.inspectSlot();
    const write = () => {
      if (!this.session) return;
      try {
        if (snapshot.revision === undefined) throw new Error('无法核对此栏位');
        this.session.resume();
        writeSlot(
          profileStorage(this.storage, this.profile),
          this.slot,
          this.session.state,
          this.now(),
          snapshot.revision,
        );
        this.message = `已保存到手动存档 ${this.slot}。`;
      } catch (error) {
        this.message =
          error instanceof SaveConflictError
            ? '另一页面已更新此手动栏位，尚未覆盖。请重新选择空栏位。'
            : '手动保存失败，请保留当前游戏并重试。';
      }
    };
    if (snapshot.status === 'empty') write();
    else this.ask(`覆盖手动存档 ${this.slot}？旧栏位会另存保留。`, write);
  }
  loadSlot(): void {
    const original = this.inspectSlot();
    const expected = this.inspect().revision;
    if (original.status !== 'ready') {
      this.message = '此栏位不可读取，原始数据未更改。';
      return;
    }
    this.ask(`读取手动存档 ${this.slot}？当前自动进度会替换，读取前的主存档会另存保留。`, () => {
      const slot = this.inspectSlot();
      if (slot.status !== 'ready') {
        this.message = '此栏位已无法读取，原始数据未更改。';
        return;
      }
      if (slot.revision !== original.revision || !expected) {
        this.message = '存档已被另一页面更改，尚未读取。请重新选择。';
        return;
      }
      // A failed autosave must not lose the live in-memory town when loading an older slot.
      if (this.session && !this.session.save()) {
        this.message = this.session.statusMessage;
        return;
      }
      try {
        resetSave(
          profileStorage(this.storage, this.profile),
          slot.state,
          this.session?.saveRevision ?? expected,
        );
        const restored = townSession(this.storage, this.profile, this.now);
        if (restored.mode !== 'normal') {
          this.message = restored.statusMessage;
          return;
        }
        this.activate(restored);
      } catch (error) {
        this.message =
          error instanceof SaveConflictError
            ? '另一页面已更新自动存档，尚未替换。当前游戏仍保留。'
            : '读取失败，当前游戏仍保留。请检查本机存储后重试。';
      }
    });
  }
  reloadLatest(): void {
    if (!this.session?.hasSaveConflict) return;
    this.ask('读取其他页面的最新自动进度？本页未保存进度将被替换，请先存入空手动栏位。', () => {
      const latest = townSession(this.storage, this.profile, this.now);
      if (latest.mode !== 'normal') {
        this.message = latest.statusMessage;
        return;
      }
      this.activate(latest);
    });
  }
  exit(): void {
    if (!this.session) {
      this.page = 'exit';
      this.message = '已停留在标题页。网页版请关闭此标签页即可退出。';
      return;
    }
    this.ask('保存进度并退出到标题？网页版不会自动关闭浏览器。', () => {
      if (!this.session) return;
      this.session.resume();
      if (!this.session.save()) {
        this.message = this.session.statusMessage;
        return;
      }
      this.session = null;
      this.profile = 'normal';
      this.page = 'title';
      this.message = '进度已保存，可随时继续。';
    });
  }
}
