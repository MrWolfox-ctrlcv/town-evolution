import { Node, UITransform, EventTouch, EventMouse, Vec2, Graphics, input } from 'cc';
import { uiNode, ActionButton } from './Widgets';
import { HandbookArt } from './HandbookArt';
import { handbookLayout, handbookLauncher, RECIPE_PAPER } from '../application/HandbookLayout';
import type { GameState } from '../domain/game';
import { HandbookPages } from './HandbookPages';
import { HandbookInputGuard, handleHandbookWheel } from './HandbookInputGuard';
import { liveInputTouches } from './InputProvenance';

/** A pocket folder, not a modal. Only visible paper intercepts island gestures. */
export class RecipeHandbook {
  private readonly directory: Node;
  private readonly paper: Node;
  private readonly content: Node;
  private readonly pages: HandbookPages;
  private readonly launcher: ActionButton;
  private readonly buttons: ActionButton[] = [];
  private readonly art = new HandbookArt();
  private width = 320;
  private height = 568;
  private bottom = 0;
  private scale = 1;
  private position: { x: number; y: number } | null = null;
  private readonly ownership: HandbookInputGuard;
  private readonly pointers = new Map<number, Vec2>();
  private readonly buttonPointers = new Map<number, Vec2>();
  private readonly startedPointers = new Set<number>();
  private view: 'closed' | 'directory' | 'paper' = 'closed';
  constructor(
    private readonly parent: Node,
    private readonly standalone = false,
    inputRoot = parent,
  ) {
    this.launcher = new ActionButton(parent, () => {});
    this.launcher.node.name = 'RecipeBookOpen';
    this.launcher.set({ text: '', run: () => this.show('directory') });
    this.art.folder(this.launcher.node);
    this.directory = uiNode('RecipeDirectory', parent);
    this.paper = uiNode('RecipeHandbook', parent);
    this.art.paper(this.paper);
    this.content = uiNode('RecipeContents', this.paper);
    this.button(this.paper, '↶', 'RecipeBookBack', -116, 140, 44, () => this.show('directory'));
    this.button(this.paper, '×', 'RecipeBookClose', 116, 140, 44, () => this.show('closed'));
    this.button(this.directory, '×', 'RecipeDirectoryClose', 116, 140, 44, () =>
      this.show('closed'),
    );
    this.pages = new HandbookPages(
      this.directory,
      this.paper,
      this.content,
      this.art,
      this.buttons,
      () => {
        this.show('paper');
        this.placePaper();
      },
    );
    this.art.directory(this.directory);
    this.directory.children
      .find((node) => node.name === 'RecipeDirectoryClose')
      ?.setSiblingIndex(this.directory.children.length - 1);
    for (const sheet of [this.directory, this.paper]) {
      sheet.on(Node.EventType.TOUCH_START, this.begin, this);
      sheet.on(Node.EventType.TOUCH_MOVE, this.move, this);
      sheet.on(Node.EventType.TOUCH_END, this.end, this);
      sheet.on(Node.EventType.TOUCH_CANCEL, this.cancel, this);
      sheet.on(Node.EventType.MOUSE_WHEEL, this.wheel, this);
    }
    this.ownership = new HandbookInputGuard(
      inputRoot,
      {
        start: (e) => this.capture(e),
        move: (e) => this.captureMove(e),
        end: (e) => this.captureEnd(e),
        cancel: (e) => this.captureCancel(e),
      },
      () => this.cancelGesture(),
      (point) => this.covers(point),
    );
    this.show('closed');
    this.layout(this.width, this.height);
    this.position = null;
  }
  layout(width: number, height: number, _left = 0, bottom = 0): void {
    this.cancelGesture();
    this.width = width;
    this.height = height;
    this.bottom = bottom;
    const position = handbookLauncher(width, height, bottom);
    this.launcher.layout(position.x, position.y, position.size);
    this.launcher.node.getComponent(UITransform)!.setContentSize(position.size, position.size);
    const cover = this.launcher.node.getChildByName('PocketFolderArtwork');
    cover?.setScale(position.size / 64, position.size / 64, 1);
    // ActionButton owns the hit area; artwork owns its appearance.
    const background = this.launcher.node.getComponent(Graphics);
    if (background) background.enabled = false;
    this.placePaper();
  }
  regions(): UITransform[] {
    return [this.launcher.node, this.directory, this.paper]
      .filter((node) => node.activeInHierarchy)
      .map((node) => node.getComponent(UITransform)!);
  }
  covers(point: { x: number; y: number }): boolean {
    return [this.launcher.node, this.directory, this.paper].some(
      (node) =>
        node.activeInHierarchy &&
        node.getComponent(UITransform)!.hitTest(new Vec2(point.x, point.y)),
    );
  }
  cancelGesture(): void {
    this.ownership?.clear();
    this.pointers.clear();
    this.buttonPointers.clear();
    this.launcher.cancelGesture();
    this.buttons.forEach((button) => button.cancelGesture());
  }
  dispose(): void {
    this.cancelGesture();
    this.startedPointers.clear();
    this.ownership.dispose();
    this.art.dispose();
    this.paper.destroy();
    this.directory.destroy();
    this.launcher.node.destroy();
  }
  open(): void {
    this.show('directory');
  }
  close(): void {
    this.show('closed');
  }
  private show(view: 'closed' | 'directory' | 'paper'): void {
    this.cancelGesture();
    this.view = view;
    this.directory.active = view === 'directory';
    this.paper.active = view === 'paper';
    this.launcher.node.active = view === 'closed' && !this.standalone;
    const node = view === 'paper' ? this.paper : this.directory;
    if (view !== 'closed') {
      this.placePaper();
      node.setSiblingIndex(this.parent.children.length - 1);
    }
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
    this.art.navigationButton(button.node, name === 'RecipeBookBack' ? 'back' : 'close');
    this.buttons.push(button);
  }
  setState(state: GameState): void {
    this.pages.setState(state);
  }
  private placePaper(point?: { x: number; y: number }): void {
    const initial = {
      x: (this.width - RECIPE_PAPER.width) / 2 - 8,
      y: -this.height / 2 + this.bottom + RECIPE_PAPER.height / 2 + 8,
    };
    const box = handbookLayout(
      this.width,
      this.height,
      point ?? this.position ?? initial,
      this.scale,
    );
    this.scale = box.scale;
    this.position = { x: box.x, y: box.y };
    for (const sheet of [this.directory, this.paper]) {
      sheet.setPosition(box.x, box.y);
      sheet.setScale(box.scale, box.scale, 1);
    }
  }
  private zoom(factor: number): void {
    this.scale = Math.max(0.75, Math.min(1.65, this.scale * factor));
    this.placePaper(this.paper.position);
  }
  private capture(event: EventTouch): void {
    const id = event.getID() ?? 0;
    const touches = liveInputTouches(event, input);
    for (const started of this.startedPointers)
      if (!touches.some((touch) => touch.getID() === started)) this.startedPointers.delete(started);
    this.startedPointers.add(id);
    if (this.pointers.has(id) || this.buttonPointers.has(id)) return;
    const target = event.target as Node;
    const control = [this.launcher, ...this.buttons].some(
      (button) => target === button.node || target.isChildOf(button.node),
    );
    const onSheet =
      this.view !== 'closed' && (target === this.activeSheet || target.isChildOf(this.activeSheet));
    if (touches.length < 2) {
      // Keep single button taps intact, but remember their origin if a second finger joins.
      if (
        onSheet &&
        control &&
        this.activeSheet.getComponent(UITransform)!.hitTest(event.getLocation())
      )
        this.buttonPointers.set(id, event.getUILocation().clone());
      return;
    }
    this.launcher.cancelGesture();
    this.buttons.forEach((button) => button.cancelGesture());
    if (control || onSheet) event.propagationStopped = true;
    if (
      !onSheet ||
      touches.length !== 2 ||
      touches.some(
        (touch) =>
          !this.activeSheet.getComponent(UITransform)!.hitTest(touch.getLocation()) ||
          (touch.getID() !== id &&
            !this.pointers.has(touch.getID()) &&
            !this.buttonPointers.has(touch.getID()) &&
            this.startedPointers.has(touch.getID())),
      )
    ) {
      this.pointers.clear();
      this.buttonPointers.clear();
      return;
    }
    // A simultaneous batch may report both touches before the second START is dispatched.
    this.buttonPointers.set(id, event.getUILocation().clone());
    if (
      touches.some(
        (touch) => !this.pointers.has(touch.getID()) && !this.buttonPointers.has(touch.getID()),
      )
    )
      return;
    // Both contacts started on this sheet. Buttons cannot consume their later events.
    for (const touch of touches) this.pointers.set(touch.getID(), touch.getUILocation().clone());
    this.buttonPointers.clear();
  }
  private captureMove(event: EventTouch): void {
    const id = event.getID() ?? 0;
    if (this.buttonPointers.has(id)) this.buttonPointers.set(id, event.getUILocation().clone());
    else if (this.pointers.has(id)) this.move(event);
  }
  private captureEnd(event: EventTouch): void {
    this.startedPointers.delete(event.getID() ?? 0);
    if (!this.buttonPointers.delete(event.getID() ?? 0) && this.pointers.has(event.getID() ?? 0))
      this.end(event);
  }
  private captureCancel(event: EventTouch): void {
    this.startedPointers.delete(event.getID() ?? 0);
    if (this.buttonPointers.delete(event.getID() ?? 0)) return;
    if (this.pointers.has(event.getID() ?? 0)) this.cancel(event);
  }
  private get activeSheet(): Node {
    return this.view === 'directory' ? this.directory : this.paper;
  }
  private begin(event: EventTouch): void {
    event.propagationStopped = true;
    if (
      this.pointers.size === 0 &&
      liveInputTouches(event, input).some(
        (touch) => !this.activeSheet.getComponent(UITransform)!.hitTest(touch.getLocation()),
      )
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
    }
    previous.set(point);
  }
  private end(event: EventTouch): void {
    event.propagationStopped = true;
    this.pointers.delete(event.getID() ?? 0);
  }
  private cancel(event: EventTouch): void {
    event.propagationStopped = true;
    if (this.pointers.has(event.getID() ?? 0)) this.cancelGesture();
  }
  private wheel(event: EventMouse): void {
    handleHandbookWheel(event, (factor) => this.zoom(factor));
  }
}
