import { _decorator, Component, screen, game, Game, Node, sys, input } from 'cc';
import { TownController } from './TownController';
import { GameStart } from '../application/GameStart';
import { ExclusiveGameStorage } from '../application/ExclusiveGameStorage';
import type { GameSession } from '../application/GameSession';
import { StartScreen } from './StartScreen';
import { configureTownLighting } from './SceneLighting';
import { prepareTownEnvironment } from './EnvironmentEffect';
import { bindSafeViewportChanges } from './SafeViewport';
import { bindBrowserInputGuard } from './BrowserInputGuard';
import { bindInputProvenance, clearInputProvenance } from './InputProvenance';
const { ccclass } = _decorator;
/** Owns title, gameplay and overlay lifetimes; all persistence decisions live in GameStart. */
@ccclass('TownBootstrap')
export class TownBootstrap extends Component {
  private controller: TownController | null = null;
  private controllerSession: GameSession | null = null;
  private stage: Node | null = null;
  private flow!: GameStart;
  private storage!: ExclusiveGameStorage;
  private menu!: StartScreen;
  private renderScheduled = false;
  private storageWarning = '';
  private releaseBrowserInput: ReturnType<typeof bindBrowserInputGuard> | null = null;
  private releaseInputProvenance: (() => void) | null = null;
  private releaseSafeViewport: (() => void) | null = null;
  private cancelEnvironment: (() => void) | null = null;
  onLoad(): void {
    this.cancelEnvironment = prepareTownEnvironment(() => {
      if (this.isValid && this.node.isValid) this.startTown();
    });
  }
  private startTown(): void {
    this.releaseInputProvenance = bindInputProvenance(input);
    configureTownLighting(this.node.scene!);
    const locks =
      typeof navigator !== 'undefined' && navigator.locks
        ? {
            request: async (name: string, run: () => Promise<void>) => {
              await navigator.locks.request(name, { mode: 'exclusive' }, run);
            },
          }
        : null;
    this.storage = new ExclusiveGameStorage(sys.localStorage, locks, () => {
      if (this.flow?.message === this.storageWarning) this.flow.message = '';
      this.storageWarning = this.storage.warning;
      this.queueRender();
    });
    this.storageWarning = this.storage.warning;
    this.flow = new GameStart(
      this.storage,
      () => Date.now(),
      () => this.storage.warning,
    );
    this.menu = new StartScreen(this.node, this.flow, () => this.queueRender());
    this.render();
    this.storage.start();
    this.releaseSafeViewport = bindSafeViewportChanges(() => this.queueRender());
    screen.on('window-resize', this.onResize, this);
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);
    this.releaseBrowserInput = bindBrowserInputGuard((reason) => {
      clearInputProvenance(input, reason === 'mouse' ? 'mouse' : 'all');
      this.menu.cancelGestures();
      this.controller?.cancelInput();
    });
  }
  update(dt: number): void {
    if (!this.flow) return;
    if (this.flow.tickPreparation() && this.flow.page !== 'preparing') this.queueRender();
    if (this.flow.page === 'game') this.controller?.tick(dt);
    else this.menu.tick(dt);
  }
  onDestroy(): void {
    this.cancelEnvironment?.();
    this.cancelEnvironment = null;
    this.flow?.preparation.cancel();
    this.releaseInputProvenance?.();
    this.releaseInputProvenance = null;
    this.releaseBrowserInput?.();
    this.releaseBrowserInput = null;
    this.releaseSafeViewport?.();
    this.releaseSafeViewport = null;
    screen.off('window-resize', this.onResize, this);
    game.off(Game.EVENT_HIDE, this.onHide, this);
    game.off(Game.EVENT_SHOW, this.onShow, this);
    this.storage?.dispose();
    this.controller?.dispose();
    this.menu?.dispose();
    this.controller = null;
  }
  private queueRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    this.scheduleOnce(() => {
      this.renderScheduled = false;
      this.render();
    }, 0);
  }
  private render(): void {
    const session = this.flow.session;
    if (this.controllerSession !== session) {
      if (this.stage) this.stage.active = false;
      this.controller?.dispose();
      this.stage?.destroy();
      this.controller = null;
      this.stage = null;
      this.controllerSession = session;
    }
    const playing = this.flow.page === 'game' && session !== null;
    if (playing) this.menu.hide();
    else this.menu.root.active = true;
    if (playing && !this.controller) {
      this.stage = new Node('TownSession');
      this.node.addChild(this.stage);
      this.controller = new TownController(
        this.stage,
        session,
        this.flow.profile,
        (next) => {
          this.flow.switchTown(next);
          this.queueRender();
        },
        (action) => {
          this.controller?.suspend();
          if (action === 'settings') this.flow.settings();
          else if (action === 'saves') this.flow.saves();
          else this.flow.exit();
          this.queueRender();
        },
      );
    }
    if (this.stage) this.stage.active = session !== null;
    this.controller?.setMenuOverlay(!playing);
    if (playing) {
      this.controller?.layout();
      this.controller?.resume();
      if (this.flow.consumeTownActions()) this.controller?.openTownActions();
    } else this.menu.render();
  }
  private onResize(): void {
    this.queueRender();
  }
  private onHide(): void {
    this.releaseBrowserInput?.reset();
    clearInputProvenance(input);
    this.menu.cancelGestures();
    if (this.controllerSession === this.flow.session) this.controller?.suspend();
    else this.flow.session?.suspend();
  }
  private onShow(): void {
    this.flow.session?.resume();
    this.queueRender();
  }
}
