import {
  Node,
  Canvas,
  Camera,
  Layers,
  UITransform,
  Label,
  LabelOutline,
  screen,
  view,
  ResolutionPolicy,
} from 'cc';
import { createGame } from '../domain/game';
import type { GameStart } from '../application/GameStart';
import { startMenu } from '../application/StartMenu';
import { startLayout } from '../application/StartLayout';
import { uiNode, label, panel, ActionButton, consumeTouches } from './Widgets';
import { color } from './Palette';
import { StartArtwork } from './StartArtwork';
import { RecipeHandbook } from './RecipeHandbook';
import { SettingsPanel } from './SettingsPanel';
/** Native Cocos menus over an isolated, read-only rendering of the playable demo template. */
export class StartScreen {
  readonly root: Node;
  private readonly canvas: Node;
  private readonly content: Node;
  private readonly card: Node;
  private readonly heading: Label;
  private readonly subtitle: Label;
  private readonly detail: Label;
  private readonly footer: Label;
  private artwork: StartArtwork | null = null;
  private readonly handbook: RecipeHandbook;
  private readonly imageMenu: SettingsPanel;
  private readonly buttons: ActionButton[] = [];
  private currentPage = '';
  constructor(
    parent: Node,
    private readonly flow: GameStart,
    private readonly changed: () => void,
  ) {
    this.root = new Node('StartScreen');
    parent.addChild(this.root);
    this.canvas = uiNode('StartCanvas', this.root);
    const cameraNode = new Node('StartCamera');
    this.root.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.priority = 20;
    camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    camera.clearColor = color('#7DAED9');
    camera.visibility = Layers.Enum.UI_2D;
    camera.near = 1;
    camera.far = 2000;
    const canvas = this.canvas.addComponent(Canvas);
    canvas.cameraComponent = camera;
    canvas.alignCanvasWithScreen = true;
    consumeTouches(this.canvas);
    this.content = uiNode('StartContents', this.canvas);
    this.card = uiNode('MenuSurface', this.content);
    consumeTouches(this.card);
    this.heading = this.text('', 42);
    this.subtitle = this.text('', 14);
    this.detail = this.text('', 16);
    this.footer = this.text('演示岛实机画面 · 背景不改变游戏进度', 11);
    const outline = this.heading.node.addComponent(LabelOutline);
    outline.color = color('#FFF6DD');
    outline.width = 2;
    this.imageMenu = new SettingsPanel(this.canvas, this.flow, this.changed);
    this.handbook = new RecipeHandbook(this.canvas, true);
    view.resizeWithBrowserSize(true);
  }
  private text(text: string, size: number): Label {
    const value = label(this.content, text, size);
    value.horizontalAlign = Label.HorizontalAlign.CENTER;
    return value;
  }
  render(): void {
    if (this.currentPage !== this.flow.page) this.handbook.close();
    this.currentPage = this.flow.page;
    const data = startMenu(this.flow, () => this.handbook.open());
    this.handbook.setState(
      this.flow.session?.state ?? this.flow.inspect().state ?? createGame(Date.now()),
    );
    const dpr = Math.max(1, screen.devicePixelRatio);
    const width = Math.max(1, screen.windowSize.width / dpr);
    const height = Math.max(1, screen.windowSize.height / dpr);
    const title = this.flow.page === 'title';
    const layout = startLayout(width, height, data.actions.length, title);
    view.setDesignResolutionSize(width, height, ResolutionPolicy.SHOW_ALL);
    this.canvas.getComponent(UITransform)!.setContentSize(width, height);
    this.artwork ??= new StartArtwork(this.root);
    this.artwork.layout(width, height);
    this.content.active = title;
    if (!title) {
      this.buttons.forEach((button) => button.cancelGesture());
      this.imageMenu.render(data, width, height);
      this.handbook.layout(width, height);
      return;
    }
    this.imageMenu.hide();
    this.card.active = !title;
    if (!title) panel(this.card, layout.cardWidth, layout.cardHeight, '#FFF4DFF2', 18);
    this.heading.string = data.title;
    this.heading.fontSize = title ? 42 : 30;
    this.subtitle.string = data.subtitle;
    this.detail.string = [
      data.detail,
      this.flow.storageWarning,
      this.flow.message ||
        (this.flow.session?.hasUnsavedChanges ? this.flow.session.statusMessage : ''),
    ]
      .filter(Boolean)
      .join('\n');
    for (const [text, y, h] of [
      [this.heading, layout.headingY, 64],
      [this.subtitle, layout.subtitleY, 28],
      [this.detail, layout.detailY, layout.detailHeight],
      [this.footer, -height / 2 + 23, 30],
    ] as const) {
      text.node.setPosition(0, y);
      text.node.getComponent(UITransform)!.setContentSize(width - 40, h);
      text.color = color('#214F45');
      if (!text.node.getComponent(LabelOutline)) {
        const outline = text.node.addComponent(LabelOutline);
        outline.color = color('#FFF6DD');
        outline.width = 2;
      }
    }
    this.detail.node
      .getComponent(UITransform)!
      .setContentSize(layout.cardWidth - 28, layout.detailHeight);
    data.actions.forEach((action, i) => {
      const button =
        this.buttons[i] ??
        new ActionButton(this.content, (text) => {
          this.flow.message = text === this.flow.storageWarning ? '' : text;
          this.changed();
        });
      this.buttons[i] = button;
      button.node.name = `Menu-${action.id}`;
      button.cancelGesture();
      const blocked =
        this.flow.storageWarning &&
        ![
          'saves',
          'guide',
          'exit',
          'back',
          'cancel',
          'profile',
          'slot-1',
          'slot-2',
          'slot-3',
        ].includes(action.id);
      button.set({
        ...action,
        ...(blocked ? { enabled: false, reason: this.flow.storageWarning } : {}),
        run: () => {
          action.run();
          this.changed();
        },
      });
      button.layout(layout.buttons[i].x, layout.buttons[i].y, layout.buttonWidth, {
        height: layout.buttonHeight,
        fontSize: title && i === 0 ? 19 : 16,
      });
    });
    this.buttons.slice(data.actions.length).forEach((button) => button.set(null));
    this.handbook.layout(width, height);
  }
  tick(dt: number): void {
    this.artwork?.tick(dt);
  }
  /** Gameplay must not retain a second island, extra camera or crop updater. */
  hide(): void {
    this.cancelGestures();
    this.artwork?.dispose();
    this.artwork = null;
    this.root.active = false;
  }
  cancelGestures(): void {
    this.buttons.forEach((button) => button.cancelGesture());
    this.imageMenu.cancelGestures();
    this.handbook.cancelGesture();
  }
  dispose(): void {
    this.cancelGestures();
    this.handbook.dispose();
    this.imageMenu.dispose();
    this.artwork?.dispose();
    this.root.destroy();
  }
}
