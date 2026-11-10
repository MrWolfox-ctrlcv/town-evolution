import { layoutTitleButtons, layoutTitleText } from './StartTitleLayout';
import {
  Node,
  EventTouch,
  EventMouse,
  input,
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
import { uiNode, label, ActionButton, consumeTouches } from './Widgets';
import { color } from './Palette';
import { hasMultipleContacts } from './InputProvenance';
import { SafeControls } from './SafeControls';
import { StartArtwork } from './StartArtwork';
import { RecipeHandbook } from './RecipeHandbook';
import { SettingsPanel } from './SettingsPanel';
/** Native Cocos menus over an isolated, read-only rendering of the playable demo template. */
export class StartScreen {
  readonly root: Node;
  private readonly canvas: Node;
  private readonly controls: SafeControls;
  private readonly content: Node;
  private readonly heading: Label;
  private readonly subtitle: Label;
  private readonly detail: Label;
  private readonly footer: Label;
  private artwork: StartArtwork | null = null;
  private handbook: RecipeHandbook | null = null;
  private menuWidth = 320;
  private menuHeight = 568;
  private readonly imageMenu: SettingsPanel;
  private readonly buttons: ActionButton[] = [];
  private currentPage = '';
  private titleLayout: ReturnType<typeof startLayout> | null = null;
  private titleScroll = 0;
  private scrollTouch: { id: number; y: number; start: number; moved: boolean } | null = null;
  private readonly beginScroll = (event: EventTouch) => {
    if (
      !this.root.activeInHierarchy ||
      !this.content.active ||
      this.handbook?.regions().length ||
      !this.titleLayout?.scrollMax ||
      hasMultipleContacts(event, input)
    )
      return;
    const p = event.getUILocation(),
      y = p.y - this.controls.root.worldPosition.y;
    if (y < this.titleLayout.viewportBottom || y > this.titleLayout.viewportTop) return;
    const id = event.getID();
    if (id === null) return;
    this.scrollTouch = { id, y: p.y, start: this.titleScroll, moved: false };
  };
  private readonly moveScroll = (event: EventTouch) => {
    const touch = this.scrollTouch;
    if (!touch || touch.id !== event.getID()) return;
    if (hasMultipleContacts(event, input)) {
      this.cancelGestures();
      return;
    }
    const delta = event.getUILocation().y - touch.y;
    if (!touch.moved && Math.abs(delta) < 8) return;
    touch.moved = true;
    this.buttons.forEach((button) => button.cancelGesture());
    this.titleScroll = Math.max(0, Math.min(this.titleLayout!.scrollMax, touch.start + delta));
    this.layoutTitleButtons();
  };
  private readonly endScroll = (event: EventTouch) => {
    if (this.scrollTouch?.id !== event.getID()) return;
    if (this.scrollTouch.moved) this.buttons.forEach((button) => button.cancelGesture());
    this.scrollTouch = null;
  };
  private readonly wheelScroll = (event: EventMouse) => {
    if (
      !this.root.activeInHierarchy ||
      !this.content.active ||
      this.handbook?.regions().length ||
      !this.titleLayout?.scrollMax
    )
      return;
    this.buttons.forEach((button) => button.cancelGesture());
    this.titleScroll = Math.max(
      0,
      Math.min(this.titleLayout.scrollMax, this.titleScroll - event.getScrollY() * 0.25),
    );
    this.layoutTitleButtons();
  };
  private layoutTitleButtons(): void {
    const layout = this.titleLayout;
    if (!layout) return;
    layoutTitleButtons(this.buttons, layout, this.titleScroll);
  }
  private readonly cancelMultiTouch = (event: EventTouch) => {
    if (!hasMultipleContacts(event, input)) return;
    this.buttons.forEach((button) => button.cancelGesture());
    this.scrollTouch = null;
    this.imageMenu.cancelGestures();
    // HandbookInputGuard owns legitimate two-finger paper gestures.
  };
  constructor(
    parent: Node,
    private readonly flow: GameStart,
    private readonly changed: () => void,
  ) {
    this.root = new Node('StartScreen');
    parent.addChild(this.root);
    this.canvas = uiNode('StartCanvas', this.root);
    this.canvas.on(Node.EventType.TOUCH_START, this.cancelMultiTouch, this, true);
    this.canvas.on(Node.EventType.TOUCH_START, this.beginScroll, this, true);
    this.canvas.on(Node.EventType.TOUCH_MOVE, this.moveScroll, this, true);
    this.canvas.on(Node.EventType.TOUCH_END, this.endScroll, this, true);
    this.canvas.on(Node.EventType.TOUCH_CANCEL, this.endScroll, this, true);
    this.canvas.on(Node.EventType.MOUSE_WHEEL, this.wheelScroll, this);
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
    this.controls = new SafeControls(this.canvas);
    this.content = uiNode('StartContents', this.controls.root);
    this.heading = this.text('', 42);
    this.subtitle = this.text('', 14);
    this.detail = this.text('', 16);
    this.footer = this.text('演示岛实机画面 · 背景不改变游戏进度', 11);
    const outline = this.heading.node.addComponent(LabelOutline);
    outline.color = color('#FFF6DD');
    outline.width = 2;
    this.imageMenu = new SettingsPanel(this.controls.root, this.flow, this.changed);
    view.resizeWithBrowserSize(true);
  }
  private text(text: string, size: number): Label {
    const value = label(this.content, text, size);
    value.horizontalAlign = Label.HorizontalAlign.CENTER;
    return value;
  }
  render(): void {
    if (this.currentPage !== this.flow.page) {
      this.handbook?.close();
      this.titleScroll = 0;
      this.scrollTouch = null;
    }
    this.currentPage = this.flow.page;
    const data = startMenu(this.flow, () => this.openHandbook());
    if (this.flow.page !== 'preparing')
      this.handbook?.setState(
        this.flow.session?.state ?? this.flow.inspect().state ?? createGame(Date.now()),
      );
    const dpr = Math.max(1, screen.devicePixelRatio);
    const fullWidth = Math.max(1, screen.windowSize.width / dpr);
    const fullHeight = Math.max(1, screen.windowSize.height / dpr);
    view.setDesignResolutionSize(fullWidth, fullHeight, ResolutionPolicy.SHOW_ALL);
    this.canvas.getComponent(UITransform)!.setContentSize(fullWidth, fullHeight);
    const { width, height } = this.controls.layout(fullWidth, fullHeight);
    this.menuWidth = width;
    this.menuHeight = height;
    const title = this.flow.page === 'title';
    const layout = startLayout(width, height, data.actions.length, title);
    this.artwork ??= new StartArtwork(this.root);
    this.artwork.layout(fullWidth, fullHeight);
    this.content.active = title;
    if (!title) {
      this.buttons.forEach((button) => button.cancelGesture());
      this.imageMenu.render(data, width, height);
      this.handbook?.layout(width, height);
      return;
    }
    this.imageMenu.hide();
    this.titleLayout = layout;
    this.titleScroll = Math.min(this.titleScroll, layout.scrollMax);
    this.scrollTouch = null;
    this.footer.string = layout.scrollMax
      ? '上滑或滚轮查看更多 · 背景不改变游戏进度'
      : '演示岛实机画面 · 背景不改变游戏进度';
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
    layoutTitleText(
      [
        [this.heading, layout.headingY, 64],
        [this.subtitle, layout.subtitleY, 28],
        [this.detail, layout.detailY, layout.detailHeight],
        [this.footer, -height / 2 + 23, 30],
      ],
      width,
    );
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
          if (!button.node.activeInHierarchy || this.scrollTouch?.moved) return;
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
    this.layoutTitleButtons();
    this.handbook?.layout(width, height);
  }
  private openHandbook(): void {
    this.handbook ??= new RecipeHandbook(this.controls.root, true, this.canvas);
    this.handbook.setState(
      this.flow.session?.state ?? this.flow.inspect().state ?? createGame(Date.now()),
    );
    this.handbook.layout(this.menuWidth, this.menuHeight);
    this.handbook.open();
  }
  tick(dt: number): void {
    if (this.flow.page === 'preparing') this.imageMenu.progress(this.flow.preparation.message);
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
    this.scrollTouch = null;
    this.buttons.forEach((button) => button.cancelGesture());
    this.imageMenu.cancelGestures();
    this.handbook?.cancelGesture();
  }
  dispose(): void {
    this.canvas.off(Node.EventType.TOUCH_START, this.cancelMultiTouch, this, true);
    this.canvas.off(Node.EventType.TOUCH_START, this.beginScroll, this, true);
    this.canvas.off(Node.EventType.TOUCH_MOVE, this.moveScroll, this, true);
    this.canvas.off(Node.EventType.TOUCH_END, this.endScroll, this, true);
    this.canvas.off(Node.EventType.TOUCH_CANCEL, this.endScroll, this, true);
    this.canvas.off(Node.EventType.MOUSE_WHEEL, this.wheelScroll, this);
    this.cancelGestures();
    this.handbook?.dispose();
    this.imageMenu.dispose();
    this.artwork?.dispose();
    this.root.destroy();
  }
}
