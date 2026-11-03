import { _decorator, Component, screen, game, Game, Node, sys } from 'cc';
import { TownController } from './TownController';
import { activeProfile, townSession, PROFILE_KEY } from '../application/TownProfiles';
import type { TownProfile } from '../application/TownProfiles';
const { ccclass } = _decorator;
/** Owns scene lifetime and profile switching, never game rules. */
@ccclass('TownBootstrap')
export class TownBootstrap extends Component {
  private controller: TownController | null = null;
  private stage: Node | null = null;
  onLoad(): void {
    this.open(activeProfile(sys.localStorage));
    screen.on('window-resize', this.onResize, this);
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);
  }
  update(dt: number): void {
    this.controller?.tick(dt);
  }
  onDestroy(): void {
    screen.off('window-resize', this.onResize, this);
    game.off(Game.EVENT_HIDE, this.onHide, this);
    game.off(Game.EVENT_SHOW, this.onShow, this);
    this.controller?.dispose();
    this.controller = null;
  }
  private open(profile: TownProfile): void {
    if (this.stage) this.stage.active = false;
    this.controller?.dispose();
    this.stage?.destroy();
    this.stage = new Node('TownSession');
    this.node.addChild(this.stage);
    const session = townSession(sys.localStorage, profile, () => Date.now());
    this.controller = new TownController(this.stage, session, profile, (next) =>
      this.scheduleOnce(() => this.open(next), 0),
    );
    try {
      sys.localStorage.setItem(PROFILE_KEY, profile);
    } catch {
      /* Town save errors remain visible through the session. */
    }
  }
  private onResize(): void {
    this.scheduleOnce(() => this.controller?.layout(), 0);
  }
  private onHide(): void {
    this.controller?.suspend();
  }
  private onShow(): void {
    this.controller?.resume();
  }
}
