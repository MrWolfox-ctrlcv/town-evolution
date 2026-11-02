import { Node, UITransform, Label, Graphics, Layers, EventTouch } from 'cc';
import { PALETTE, color } from './Palette';
import { TapGesture } from '../application/TapGesture';
export function uiNode(name: string, parent: Node): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  parent.addChild(node);
  node.addComponent(UITransform);
  return node;
}
export function label(parent: Node, text: string, size = 18): Label {
  const node = uiNode('Label', parent);
  node.getComponent(UITransform)!.setContentSize(300, 48);
  const value = node.addComponent(Label);
  value.string = text;
  value.fontSize = size;
  value.lineHeight = Math.round(size * 1.35);
  value.color = color(PALETTE.ink);
  value.enableWrapText = true;
  value.overflow = Label.Overflow.SHRINK;
  value.horizontalAlign = Label.HorizontalAlign.LEFT;
  value.verticalAlign = Label.VerticalAlign.CENTER;
  return value;
}
export function panel(node: Node, width: number, height: number, fill: string, radius = 12): void {
  node.getComponent(UITransform)!.setContentSize(width, height);
  const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  graphics.clear();
  graphics.fillColor = color(fill);
  graphics.roundRect(-width / 2, -height / 2, width, height, radius);
  graphics.fill();
}
export function consumeTouches(node: Node): void {
  const stop = (event: EventTouch) => {
    event.propagationStopped = true;
  };
  node.on(Node.EventType.TOUCH_START, stop);
  node.on(Node.EventType.TOUCH_MOVE, stop);
  node.on(Node.EventType.TOUCH_END, stop);
}
export interface Action {
  text: string;
  run: () => void;
  enabled?: boolean;
  reason?: string;
  caution?: boolean;
}
/** Persistent button nodes: refresh changes data, not the node tree. */
export class ActionButton {
  readonly node: Node;
  private readonly title: Label;
  private action: Action | null = null;
  private width = 100;
  private visualKey = '';
  private readonly gesture = new TapGesture();
  private pressed: Action | null = null;
  constructor(
    parent: Node,
    private readonly explain: (text: string) => void,
  ) {
    this.node = uiNode('Action', parent);
    this.title = label(this.node, '', 17);
    this.title.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.title.color = color(PALETTE.paper);
    consumeTouches(this.node);
    this.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      if (this.gesture.begin(event.getID() ?? 0, event.getUILocation())) this.pressed = this.action;
    });
    this.node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      this.gesture.move(event.getID() ?? 0, event.getUILocation());
    });
    this.node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
      this.gesture.cancel(event.getID() ?? 0);
    });
    this.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      if (!this.gesture.end(event.getID() ?? 0)) return;
      const action = this.pressed;
      this.pressed = null;
      if (!action) return;
      if (action.enabled === false) {
        this.explain(action.reason ?? '条件尚未满足');
        return;
      }
      action.run();
    });
  }

  cancelGesture(): void {
    this.gesture.cancel();
    this.pressed = null;
  }
  set(action: Action | null): void {
    this.action = action;
    this.node.active = action !== null;
    if (!action) return;
    this.title.string = action.text;
    const key = [this.width, action.enabled, action.caution].join(':');
    if (key === this.visualKey) return;
    this.visualKey = key;
    panel(
      this.node,
      this.width,
      48,
      action.enabled === false ? PALETTE.muted : action.caution ? PALETTE.danger : PALETTE.teal,
      10,
    );
  }
  layout(x: number, y: number, width: number): void {
    this.width = width;
    this.node.setPosition(x, y);
    this.title.node.getComponent(UITransform)!.setContentSize(width - 12, 42);
    this.set(this.action);
  }
}
