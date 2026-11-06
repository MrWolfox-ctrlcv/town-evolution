import { ActionArtwork, actionIcon } from './ActionArtwork';
import { Node, UITransform, Label, Graphics, Layers, EventTouch, LabelOutline } from 'cc';
import { PALETTE, color } from './Palette';
import { InputTapGesture } from './InputTapGesture';
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
export interface ButtonSurface {
  bindButton(node: Node, width: number, height: number, action: Action): void;
}
export interface Action {
  text: string;
  icon?: string;
  run: () => void;
  enabled?: boolean;
  reason?: string;
  caution?: boolean;
}
/** Persistent button nodes: refresh changes data, not the node tree. */
export class ActionButton {
  readonly node: Node;
  private readonly title: Label;
  private readonly icon: Node | null;
  private action: Action | null = null;
  private width = 100;
  private height = 48;
  private theme: 'default' | 'tab' | 'quiet' = 'default';
  private selected = false;
  private iconOnly = false;
  private visualKey = '';
  private readonly gesture = new InputTapGesture();
  private pressed: Action | null = null;
  constructor(
    parent: Node,
    private readonly explain: (text: string) => void,
    private readonly artwork?: ActionArtwork,
    private readonly surface?: ButtonSurface,
  ) {
    this.node = uiNode('Action', parent);
    this.title = label(this.node, '', 17);
    this.title.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.title.color = color(PALETTE.paper);
    this.icon = artwork ? uiNode('ActionIcon', this.node) : null;
    if (artwork) {
      const outline = this.title.node.addComponent(LabelOutline);
      outline.color = color('#344E3D');
      outline.width = 2;
    }
    consumeTouches(this.node);
    this.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      if (this.gesture.begin(event)) this.pressed = this.action;
    });
    this.node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      this.gesture.move(event);
    });
    this.node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
      this.gesture.cancel(event);
    });
    this.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      if (!this.gesture.end(event)) return;
      const action = this.pressed;
      this.pressed = null;
      if (!action) {
        this.cancelGesture();
        return;
      }
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
  setSelected(selected: boolean): void {
    if (this.selected === selected) return;
    this.selected = selected;
    this.set(this.action);
  }
  set(action: Action | null): void {
    this.action = action;
    this.node.active = action !== null;
    if (!action) {
      this.cancelGesture();
      return;
    }
    this.title.string = action.text;
    this.title.node.active = !this.iconOnly;
    if (this.surface) {
      this.title.color = color(action.enabled === false ? '#736D5C' : '#3C4A28');
      this.surface.bindButton(this.node, this.width, this.height, action);
      return;
    }
    if (this.icon && this.artwork) {
      this.title.color = color(
        action.enabled === false ? '#DADAC8' : action.caution ? '#FFD0A8' : '#FFF9E6',
      );
      this.title.node.setPosition(0, -this.height / 2 + 15);
      this.title.node.getComponent(UITransform)!.setContentSize(this.width, 28);
      this.icon.setPosition(0, this.iconOnly ? 0 : 10);
      this.artwork.bind(
        this.icon,
        action.icon ?? action.icon ?? actionIcon(action.text),
        Math.min(60, this.width - 6, this.height - (this.iconOnly ? 2 : 22)),
        action.enabled !== false,
      );
      const g = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
      g.clear();
      this.node.getComponent(UITransform)!.setContentSize(this.width, this.height);
      if (this.selected) {
        g.lineWidth = 2;
        g.strokeColor = color('#FFE08F');
        g.ellipse(0, 6, 28, 23);
        g.stroke();
      }
      return;
    }
    this.title.color = color(
      this.theme === 'quiet' || (this.theme === 'tab' && !this.selected)
        ? PALETTE.ink
        : PALETTE.paper,
    );
    const key = [
      this.width,
      this.height,
      this.theme,
      this.selected,
      action.enabled,
      action.caution,
    ].join(':');
    if (key === this.visualKey) return;
    this.visualKey = key;
    panel(
      this.node,
      this.width,
      this.height,
      action.enabled === false
        ? PALETTE.muted
        : action.caution
          ? PALETTE.danger
          : this.theme === 'tab'
            ? this.selected
              ? '#D2994E'
              : '#F8EBD4'
            : this.theme === 'quiet'
              ? '#E2DDC7'
              : PALETTE.teal,
      8,
    );
  }
  layout(
    x: number,
    y: number,
    width: number,
    options: {
      height?: number;
      fontSize?: number;
      theme?: 'default' | 'tab' | 'quiet';
      iconOnly?: boolean;
    } = {},
  ): void {
    this.width = width;
    this.iconOnly = options.iconOnly ?? false;
    this.height = options.height ?? 48;
    this.theme = options.theme ?? 'default';
    this.title.fontSize = options.fontSize ?? 17;
    this.node.setPosition(x, y);
    this.title.node.getComponent(UITransform)!.setContentSize(width - 12, this.height - 6);
    this.set(this.action);
  }
}
