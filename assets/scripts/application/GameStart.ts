import {
  inspectProfile,
  inspectProfileSlot,
  profileBackupPending,
  switchToSeededCoast,
  resetProfileTown,
  exitProfileTown,
} from './StartProfileActions';
import { V7PreparationFlow } from './V7PreparationFlow';
import { setActiveV7World } from '../domain/v7-world';
import { StartRecoveryActions } from './StartRecoveryActions';
import { setActiveV6World } from '../domain/v6-world';
import { saveStartSlot, loadStartSlot } from './StartSaveActions';
import type { StartSlotInfo } from './V6SlotInspection';
import { V6PreparationFlow, type V6PreparationOptions } from './V6PreparationFlow';
import { type KeyValueStorage, type LoadResult } from '../domain/storage';
import { townSession, profileStorage, PROFILE_KEY } from './TownProfiles';
import type { TownProfile } from './TownProfiles';
import type { GameSession } from './GameSession';
import { type ManualSlot } from './ManualSaves';
import { preparationOrigin, type StartPage } from './StartNavigation';
export type { StartPage } from './StartNavigation';
type Pending = { text: string; run: () => void; back: StartPage };
export class GameStart {
  page: StartPage = 'title';
  profile: TownProfile = 'normal';
  session: GameSession | null = null;
  slot: ManualSlot = 1;
  message = '';
  pending: Pending | null = null;
  private readonly preparation6 = new V6PreparationFlow();
  private readonly preparation7 = new V7PreparationFlow();
  get preparation() {
    return this.preparation7.active || this.profile === 'v7-preview'
      ? this.preparation7
      : this.preparation6;
  }
  get preparingSeededCoast(): boolean {
    return this.preparation7.active;
  }
  private cancelPreparation(): void {
    this.preparation6.cancel();
    this.preparation7.cancel();
  }
  private preparationBack: StartPage = 'title';
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
    return profileBackupPending(this.storage, this.profile);
  }
  inspect(profile = this.profile): LoadResult {
    return inspectProfile(this.storage, profile, this.now());
  }
  inspectSlot(slot = this.slot): StartSlotInfo {
    return inspectProfileSlot(this.storage, this.profile, slot, this.now());
  }
  start(profile: TownProfile = 'normal'): boolean {
    if (this.page === 'preparing') this.cancelPreparation();
    if (this.storageWarning) {
      this.message = this.storageWarning;
      return false;
    }
    if (this.session) {
      this.page = 'game';
      return true;
    }
    this.profile = profile;
    if ((profile === 'v6-preview' || profile === 'v7-preview') && !this.preparedV6) {
      this.prepareV6(() => this.start(profile));
      return false;
    }
    if (profile === 'v6-preview' || profile === 'v7-preview') {
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
    if (profile === 'v7-preview') {
      try {
        this.preparation7.assertUnchanged();
      } catch (error) {
        this.message = String(error);
        this.page = 'saves';
        return false;
      }
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
    const back = preparationOrigin(this.page, this.session !== null);
    this.preparationBack = back;
    this.page = 'preparing';
    this.message = '';
    this.preparation.start(
      profileStorage(this.storage, this.profile),
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
    setActiveV7World(session.state.terrainVersion === 7 ? session.state.mapSeed : null);
    this.page = 'game';
    this.message = '';
    try {
      this.storage.setItem(PROFILE_KEY, this.profile);
    } catch {
      /* Navigation preference failure never invalidates a saved town. */
    }
  }
  switchTown(profile: TownProfile): void {
    this.cancelPreparation();
    if (profile === 'v7-preview' && this.session) {
      this.preparationBack = this.page;
      switchToSeededCoast(this, this.storage, this.now, this.preparation7, (session) =>
        this.activate(session),
      );
      return;
    }
    if (this.session && !this.session.save()) {
      this.savesBack = 'game';
      this.message = this.session.statusMessage;
      this.page = 'saves';
      return;
    }
    this.session = null;
    setActiveV6World(null);
    setActiveV7World(null);
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
    this.cancelPreparation();
    if (!this.session) return;
    this.requestedTownActions = false;
    this.message = '';
    this.pending = null;
    this.page = 'settings';
  }
  saves(): void {
    this.cancelPreparation();
    this.requestedTownActions = false;
    this.savesBack = this.page === 'settings' ? 'settings' : 'game';
    this.message = '';
    this.pending = null;
    this.page = 'saves';
  }
  chooseProfile(profile: TownProfile): void {
    this.cancelPreparation();
    if (this.session) return;
    this.profile = profile;
    this.message = '';
    this.page = 'saves';
  }
  chooseSlot(slot: ManualSlot): void {
    this.slot = slot;
    if (
      (this.profile === 'v6-preview' || this.profile === 'v7-preview') &&
      this.inspectSlot().status === 'pending'
    ) {
      this.prepareV6(() => this.chooseSlot(slot), { slot });
      return;
    }
    this.message = '';
    this.page = 'slot';
  }
  back(): void {
    const preparing = this.page === 'preparing';
    this.cancelPreparation();
    this.requestedTownActions = false;
    this.message = '';
    if (preparing) this.page = preparationOrigin(this.preparationBack, this.session !== null);
    else if (this.pending) {
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
    if ((this.profile === 'v6-preview' || this.profile === 'v7-preview') && !this.preparedV6) {
      this.prepareV6(() => this.newGame(), { fresh: true });
      return;
    }
    resetProfileTown(
      this,
      this.storage,
      this.now,
      (text, run) => this.ask(text, run),
      (session) => this.activate(session),
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
    this.cancelPreparation();
    exitProfileTown(this, (text, run) => this.ask(text, run));
  }
}
