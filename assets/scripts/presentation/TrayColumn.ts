import { Node, Label, UITransform, EventTouch, LabelOutline } from 'cc';
import { uiNode, label } from './Widgets';
import { color } from './Palette';
import { InputTapGesture } from './InputTapGesture';
import type { TrayKind } from './TrayIcons';
export interface TrayEntry {
  kind: TrayKind;
  node: Node;
  text: Label;
  prepare?: () => void;
}
/** Each side pages independently; hidden entries never intercept map gestures. */
export class TrayColumn {
  readonly root: Node;
  readonly entries: TrayEntry[] = [];
  private readonly pager: Node;
  private readonly pageText: Label;
  private page = 0;
  private readonly gesture = new InputTapGesture();
  private slots = 6;
  private compact = false;
  private inward = 1;
  private visible: TrayEntry[] = [];
  constructor(
    parent: Node,
    name: string,
    private readonly cancel: () => void,
  ) {
    this.root = uiNode(name, parent);
    this.pager = uiNode(`${name}Next`, this.root);
    this.pager.getComponent(UITransform)!.setContentSize(56, 48);
    this.pageText = this.caption(this.pager, '›');
    this.pager.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
      this.cancel();
      this.gesture.begin(e);
    });
    this.pager.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
      e.propagationStopped = true;
      this.gesture.move(e);
    });
    this.pager.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      if (!this.gesture.end(e)) return;
      this.page = (this.page + 1) % Math.max(1, Math.ceil(this.visible.length / this.slots));
      this.render();
    });
    this.pager.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => {
      e.propagationStopped = true;
      this.gesture.cancel(e);
    });
  }
  cancelGesture(): void {
    this.gesture.cancel();
  }
  add(kind: TrayKind, name: string): TrayEntry {
    const node = uiNode(name, this.root);
    node.getComponent(UITransform)!.setContentSize(56, 56);
    const text = this.caption(node, '');
    text.node.setPosition(0, -19);
    const entry = { kind, node, text };
    this.entries.push(entry);
    return entry;
  }
  layout(x: number, y: number, height: number): void {
    this.root.setPosition(x, y);
    this.compact = height < 114;
    this.inward = x < 0 ? 1 : -1;
    this.slots = Math.max(1, Math.floor((height - 54) / 60));
    this.render();
  }
  show(predicate: (entry: TrayEntry) => boolean): void {
    this.visible = this.entries.filter(predicate);
    this.render();
  }
  /** Includes temporarily hidden pages/roots, but not items removed by the quantity filter. */
  canShow(kind: TrayKind): boolean {
    return this.visible.some((entry) => entry.kind === kind);
  }
  destination(kind: TrayKind): Node | null {
    const entry = this.entries.find((candidate) => candidate.kind === kind);
    if (!entry || !this.visible.includes(entry)) return null;
    if (entry.node.activeInHierarchy)
      return entry.node.getChildByName(`${entry.node.name}Icon`) ?? entry.node;
    return this.pager.activeInHierarchy ? this.pager : null;
  }
  regions(): UITransform[] {
    return [...this.entries.map((e) => e.node), this.pager]
      .filter((n) => n.activeInHierarchy)
      .map((n) => n.getComponent(UITransform)!);
  }
  private render(): void {
    const pages = Math.max(1, Math.ceil(this.visible.length / this.slots));
    this.page = Math.min(this.page, pages - 1);
    const shown = this.visible.slice(this.page * this.slots, (this.page + 1) * this.slots);
    this.entries.forEach((e) => {
      e.node.active = shown.includes(e);
    });
    shown.forEach((e, i) => {
      const prepare = e.prepare;
      delete e.prepare;
      prepare?.();
      e.node.setPosition(0, -i * 60);
    });
    this.pager.active = pages > 1;
    if (!this.pager.active) this.gesture.cancel();
    this.pager.setPosition(
      this.compact ? this.inward * 58 : 0,
      this.compact ? 0 : -this.slots * 60,
    );
    this.pageText.string = `${this.page + 1}/${pages} ›`;
  }
  private caption(parent: Node, value: string): Label {
    const text = label(parent, value, 12);
    text.horizontalAlign = Label.HorizontalAlign.CENTER;
    text.color = color('#FFF6DF');
    text.node.getComponent(UITransform)!.setContentSize(70, 20);
    const outline = text.node.addComponent(LabelOutline);
    outline.color = color('#344D48');
    outline.width = 2;
    return text;
  }
}
