import { Node, UITransform, EventTouch, EventMouse, Vec2, Label, Graphics } from 'cc';
import { uiNode, label, panel, consumeTouches, ActionButton } from './Widgets';
import { HandbookArt } from './HandbookArt';
import { handbookLayout, handbookLauncher } from '../application/HandbookLayout';
import { FOUNDATION } from '../domain/foundation';
import { color } from './Palette';

/** A pocket folder, not a modal. Only visible paper intercepts island gestures. */
export class RecipeHandbook {
  private readonly directory: Node;
  private readonly paper: Node;
  private readonly content: Node;
  private readonly title: Label;
  private readonly launcher: ActionButton;
  private readonly buttons: ActionButton[] = [];
  private readonly art = new HandbookArt();
  private width = 320;
  private height = 568;
  private bottom = 0;
  private scale = 1;
  private moved = false;
  private readonly pointers = new Map<number, Vec2>();
  private view: 'closed' | 'directory' | 'paper' = 'closed';
  constructor(private readonly parent: Node) {
    this.launcher = new ActionButton(parent, () => {});
    this.launcher.node.name = 'RecipeBookOpen';
    this.launcher.set({ text: '', run: () => this.show('directory') });
    this.art.folder(this.launcher.node);
    this.directory = uiNode('RecipeDirectory', parent);
    consumeTouches(this.directory);
    this.directory.on(Node.EventType.TOUCH_CANCEL, this.cancel, this);
    this.drawDirectory();
    this.paper = uiNode('RecipeHandbook', parent);
    this.art.paper(this.paper);
    this.content = uiNode('RecipeContents', this.paper);
    this.title = label(this.paper, '', 20);
    this.title.node.setPosition(-2, 57);
    this.title.node.getComponent(UITransform)!.setContentSize(218, 36);
    this.title.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.title.color = color('#365C52');
    this.button(this.paper, '目录', 'RecipeBookBack', -91, 103, 58, () => this.show('directory'));
    this.button(this.paper, '×', 'RecipeBookClose', 101, 103, 44, () => this.show('closed'));
    this.button(this.paper, '−', 'RecipeZoomOut', -88, -103, 48, () => this.zoom(1 / 1.15));
    this.button(this.paper, '＋', 'RecipeZoomIn', 88, -103, 48, () => this.zoom(1.15));
    this.art.caption(this.paper, '拖动纸张 · 双指缩放', 0, -103, 124, 10);
    this.paper.on(Node.EventType.TOUCH_START, this.begin, this);
    this.paper.on(Node.EventType.TOUCH_MOVE, this.move, this);
    this.paper.on(Node.EventType.TOUCH_END, this.end, this);
    this.paper.on(Node.EventType.TOUCH_CANCEL, this.cancel, this);
    this.paper.on(Node.EventType.MOUSE_WHEEL, this.wheel, this);
    parent.on(Node.EventType.TOUCH_START, this.capture, this, true);
    this.show('closed');
    this.layout(this.width, this.height);
  }
  layout(width: number, height: number, _left = 0, bottom = 0): void {
    this.width = width;
    this.height = height;
    this.bottom = bottom;
    const position = handbookLauncher(width, height, bottom);
    this.launcher.layout(position.x, position.y, 60);
    this.launcher.node.getComponent(UITransform)!.setContentSize(60, 60);
    // ActionButton owns the hit area; artwork owns its appearance.
    const background = this.launcher.node.getComponent(Graphics);
    if (background) background.enabled = false;
    const dir = handbookLayout(width, height, { x: width / 2 - 132, y: position.y + 118 });
    this.directory.setPosition(dir.x, dir.y);
    const fit = Math.min(1, (width - 16) / 256, (height - 16) / 258);
    this.directory.setScale(fit, fit, 1);
    this.placePaper();
  }
  covers(point: { x: number; y: number }): boolean {
    return [this.launcher.node, this.directory, this.paper].some(
      (node) =>
        node.activeInHierarchy &&
        node.getComponent(UITransform)!.hitTest(new Vec2(point.x, point.y)),
    );
  }
  cancelGesture(): void {
    this.pointers.clear();
    this.launcher.cancelGesture();
    this.buttons.forEach((button) => button.cancelGesture());
  }
  dispose(): void {
    this.cancelGesture();
    this.parent.off(Node.EventType.TOUCH_START, this.capture, this, true);
    this.art.dispose();
    this.paper.destroy();
    this.directory.destroy();
    this.launcher.node.destroy();
  }
  private show(view: 'closed' | 'directory' | 'paper'): void {
    this.cancelGesture();
    this.view = view;
    this.directory.active = view === 'directory';
    this.paper.active = view === 'paper';
    this.launcher.node.active = view === 'closed';
    const node = view === 'paper' ? this.paper : this.directory;
    if (view !== 'closed') node.setSiblingIndex(this.parent.children.length - 1);
  }
  private button(
    parent: Node,
    text: string,
    name: string,
    x: number,
    y: number,
    width: number,
    run: () => void,
  ): void {
    const button = new ActionButton(parent, () => {});
    button.node.name = name;
    button.set({ text, run });
    button.layout(x, y, width);
    if (name.startsWith('RecipeCategory-')) {
      panel(button.node, width, 48, '#FCEDCC', 5);
      const title = button.node.getComponentInChildren(Label)!;
      title.color = color('#365C52');
      title.fontSize = 15;
    }
    this.buttons.push(button);
  }
  private drawDirectory(): void {
    panel(this.directory, 256, 258, '#255C54', 12);
    const inner = uiNode('FolderLining', this.directory);
    panel(inner, 244, 246, '#E2CAA0', 9);
    const heading = label(this.directory, '配方文件夹', 20);
    heading.node.setPosition(-16, 99);
    heading.node.getComponent(UITransform)!.setContentSize(188, 32);
    heading.color = color('#30594D');
    this.button(this.directory, '×', 'RecipeDirectoryClose', 101, 103, 44, () =>
      this.show('closed'),
    );
    const rows = [
      ['01  采集 · 木材', 'gather'],
      ['02  建造 · 仓房', 'build'],
      ['03  其他 · 待补充', 'missing'],
    ] as const;
    rows.forEach(([title, id], index) => {
      const y = 36 - index * 55;
      const strip = uiNode('FolderTab-' + id, this.directory);
      panel(strip, 226, 49, index === 2 ? '#BEAC87' : '#FCEDCC', 5);
      strip.setPosition(0, y);
      this.button(this.directory, title + '  ›', 'RecipeCategory-' + id, 0, y, 216, () =>
        this.openRecipe(id),
      );
    });
    this.art.caption(this.directory, '轻点目录，抽出一张配方纸', 0, -111, 228, 11);
  }
  private openRecipe(id: 'gather' | 'build' | 'missing'): void {
    for (const child of [...this.content.children]) {
      this.art.clear(child);
      child.destroy();
    }
    this.title.string =
      id === 'gather' ? '林间采集 · 木材' : id === 'build' ? '木作建造 · 基础仓房' : '待补充的配方';
    if (id === 'missing') {
      this.art.caption(this.content, '这里还没有已确认的配方', 0, 7, 222, 16);
      this.art.caption(this.content, '水壶、肥料与锤子的用途尚未开放。', 0, -25, 222, 12);
      this.art.caption(this.content, '不以示意图代替实际玩法', 0, -51, 222, 12);
    } else {
      const kinds = id === 'gather' ? ['tree', 'axe', 'wood'] : ['wood', 'saw', 'warehouse'];
      kinds.forEach((kind, i) => this.art.icon(this.content, kind, (i - 1) * 82, 6));
      this.art.caption(this.content, '+', -41, 3, 22, 20);
      this.art.caption(this.content, '→', 41, 3, 25, 21);
      const captions =
        id === 'gather'
          ? ['树木', '斧子', `木材 ×${FOUNDATION.treeYield}`]
          : [`木材 ×${FOUNDATION.warehouseWood}`, '锯子', '基础仓房'];
      captions.forEach((text, i) =>
        this.art.caption(this.content, text, (i - 1) * 82, -31, 78, 12),
      );
      this.art.caption(
        this.content,
        id === 'gather' ? '把斧子拖到树上 · 消耗 1 耐久' : '同一地块叠放木材，再拖入锯子',
        0,
        -54,
        228,
        12,
      );
      this.art.caption(
        this.content,
        id === 'gather'
          ? '木材收进库存，留意仓库容量'
          : `预留 2×2 空地 · 每格最多 ${FOUNDATION.stackLimit} 份`,
        0,
        -70,
        228,
        10,
      );
    }
    this.show('paper');
    this.placePaper();
  }
  private placePaper(point?: { x: number; y: number }): void {
    const initial = { x: this.width / 2 - 138, y: -this.height / 2 + this.bottom + 141 };
    const box = handbookLayout(
      this.width,
      this.height,
      point ?? (this.moved ? this.paper.position : initial),
      this.scale,
    );
    this.scale = box.scale;
    this.paper.setPosition(box.x, box.y);
    this.paper.setScale(box.scale, box.scale, 1);
  }
  private zoom(factor: number): void {
    this.scale = Math.max(0.75, Math.min(1.65, this.scale * factor));
    this.placePaper(this.paper.position);
  }
  private capture(event: EventTouch): void {
    if (event.getAllTouches().length < 2) return;
    this.launcher.cancelGesture();
    this.buttons.forEach((button) => button.cancelGesture());
    const target = event.target as Node;
    const controls = [this.launcher, ...this.buttons];
    if (controls.some((button) => target === button.node || target.isChildOf(button.node)))
      event.propagationStopped = true;
    if (
      this.view === 'paper' &&
      !this.paper.getComponent(UITransform)!.hitTest(event.getLocation())
    )
      this.pointers.clear();
  }
  private begin(event: EventTouch): void {
    event.propagationStopped = true;
    if (
      this.pointers.size === 0 &&
      event
        .getAllTouches()
        .some((touch) => !this.paper.getComponent(UITransform)!.hitTest(touch.getLocation()))
    )
      return;
    this.pointers.set(event.getID() ?? 0, event.getUILocation().clone());
  }
  private move(event: EventTouch): void {
    event.propagationStopped = true;
    const id = event.getID() ?? 0;
    const previous = this.pointers.get(id);
    if (!previous) return;
    const point = event.getUILocation();
    const other = [...this.pointers.entries()].find(([key]) => key !== id)?.[1];
    if (other) {
      const before = Vec2.distance(previous, other);
      const after = Vec2.distance(point, other);
      if (before > 8) this.zoom(after / before);
    } else {
      this.placePaper({
        x: this.paper.position.x + point.x - previous.x,
        y: this.paper.position.y + point.y - previous.y,
      });
      this.moved = true;
    }
    previous.set(point);
  }
  private end(event: EventTouch): void {
    event.propagationStopped = true;
    this.pointers.delete(event.getID() ?? 0);
  }
  private cancel(event: EventTouch): void {
    event.propagationStopped = true;
    this.cancelGesture();
  }
  private wheel(event: EventMouse): void {
    event.propagationStopped = true;
    this.zoom(event.getScrollY() > 0 ? 1.1 : 1 / 1.1);
  }
}
