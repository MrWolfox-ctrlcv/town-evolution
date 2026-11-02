import { _decorator, Component, screen, game, Game } from 'cc';
import { TownController } from './TownController';
const { ccclass } = _decorator;
/** Scene entry only. Do not put game rules, rendering or UI layout here. */
@ccclass('TownBootstrap')
export class TownBootstrap extends Component {
  private controller: TownController | null = null;
  onLoad(): void {
    this.controller = new TownController(this.node);
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
