import { StartRecoveryActions } from './StartRecoveryActions';
import { setActiveV6World } from '../domain/v6-world';
import { saveStartSlot, loadStartSlot } from './StartSaveActions';
import { inspectV6Slot, v6BackupPending, type StartSlotInfo } from './V6SlotInspection';
import { V6PreparationFlow, type V6PreparationOptions } from './V6PreparationFlow';
import { loadGame, type KeyValueStorage, type LoadResult } from '../domain/storage';
import { townSession, profileStorage, PROFILE_KEY, profileLabel } from './TownProfiles';
import type { TownProfile } from './TownProfiles';
import type { GameSession } from './GameSession';
import { inspectSlot, type ManualSlot } from './ManualSaves';
export type StartPage =
  | 'title'
  | 'settings'
  | 'saves'
  | 'slot'
  | 'confirm'
  | 'exit'
  | 'game'
  | 'preparing';
type Pending = { text: string; run: () => void; back: StartPage };
export class GameStart {
  page: StartPage = 'title';
  profile: TownProfile = 'normal';
  session: GameSession | null = null;
  slot: ManualSlot = 1;
  message = '';
  pending: Pending | null = null;
  readonly preparation = new V6PreparationFlow();
  private preparedV6 = false;
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
  get hasUnpreparedV6Backup(): boolean {
    return (
      this.profile === 'v6-preview' && v6BackupPending(profileStorage(this.storage, this.profile))
    );
  }
  inspect(profile = this.profile): LoadResult {
    const saved = loadGame(profileStorage(this.storage, profile), this.now());
    return profile === 'v6-preview' && saved.state && saved.state.terrainVersion !== 6
      ? {
          status: 'corrupt',
          state: null,
          warning: '实验存档版本不匹配，原始数据未更改。',
          ...(saved.revision ? { revision: saved.revision } : {}),
        }
      : saved;
  }
  inspectSlot(slot = this.slot): StartSlotInfo {
    return (this.profile === 'v6-preview' ? inspectV6Slot : inspectSlot)(
      profileStorage(this.storage, this.profile),
      slot,
      this.now(),
    );
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
    if (profile === 'v6-preview' && !this.preparedV6) {
      this.prepareV6(() => this.start(profile));
      return false;
    }
    if (profile === 'v6-preview') {
      const saved = this.inspect();
      if (saved.status === 'corrupt') {
        this.message = saved.warning ?? '存档未通过验证';
        this.page = 'saves';
        return false;
      }
    }
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
  tickPreparation(): boolean {
    return this.page === 'preparing' && this.preparation.tick();
  }
  private prepareV6(run: () => void, options: V6PreparationOptions = {}): void {
    const back = this.page;
    this.page = 'preparing';
    this.message = '';
    this.preparation.start(
      profileStorage(this.storage, 'v6-preview'),
      () => {
        this.page = back;
        this.preparedV6 = true;
        try {
          run();
        } finally {
          this.preparedV6 = false;
        }
      },
      (message) => {
        this.page = 'saves';
        this.message = message;
      },
      options,
    );
  }
  private activate(session: GameSession): void {
    this.requestedTownActions = false;
    this.session = session;
    setActiveV6World(session.state.terrainVersion === 6 ? session.state.mapSeed : null);
    this.page = 'game';
    this.message = '';
    try {
      this.storage.setItem(PROFILE_KEY, this.profile);
    } catch {
      /* Navigation preference failure never invalidates a saved town. */
    }
  }
  switchTown(profile: TownProfile): void {
    this.preparation.cancel();
    if (this.session && !this.session.save()) {
      this.savesBack = 'game';
      this.message = this.session.statusMessage;
      this.page = 'saves';
      return;
    }
    this.session = null;
    setActiveV6World(null);
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
    this.preparation.cancel();
    if (this.session) return;
    this.profile = profile;
    this.message = '';
    this.page = 'saves';
  }
  chooseSlot(slot: ManualSlot): void {
    this.slot = slot;
    if (this.profile === 'v6-preview' && this.inspectSlot().status === 'pending') {
      this.prepareV6(() => this.chooseSlot(slot), { slot });
      return;
    }
    this.message = '';
    this.page = 'slot';
  }
  back(): void {
    this.preparation.cancel();
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
    if (this.profile === 'v6-preview' && !this.preparedV6) {
      this.prepareV6(() => this.newGame(), { fresh: true });
      return;
    }
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
  private recoveryActions(): StartRecoveryActions {
    return new StartRecoveryActions(
      this,
      this.storage,
      this.now,
      (text, run) => this.ask(text, run),
      (session) => this.activate(session),
      (run, options) => this.prepareV6(run, options),
    );
  }
  recover(): void {
    this.recoveryActions().recover();
  }
  saveNow(): void {
    if (!this.session) return;
    this.session.resume();
    this.message = this.session.save() ? '自动存档已更新。' : this.session.statusMessage;
  }
  saveSlot(): void {
    saveStartSlot(this, this.storage, this.now, (text, run) => this.ask(text, run));
  }
  loadSlot(): void {
    loadStartSlot(
      this,
      this.storage,
      this.now,
      (text, run) => this.ask(text, run),
      (session) => this.activate(session),
    );
  }
  reloadLatest(): void {
    this.recoveryActions().reload();
  }
  exit(): void {
    this.preparation.cancel();
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
      setActiveV6World(null);
      this.profile = 'normal';
      this.page = 'title';
      this.message = '进度已保存，可随时继续。';
    });
  }
}
