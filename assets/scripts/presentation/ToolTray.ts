import { Node, UITransform, EventTouch, Vec2, Graphics } from 'cc';
import { color } from './Palette';
import { uiNode } from './Widgets';
import type { Stock, Tool } from '../domain/game';
import { TrayIcons, TRAY_LABELS } from './TrayIcons';
import type { TrayKind } from './TrayIcons';
import { TrayColumn } from './TrayColumn';
export type ToolKind = TrayKind;
export interface ToolHandlers {
  begin(kind: ToolKind, id: number, point: Vec2): void | boolean;
  move(id: number, point: Vec2): void;
  end(id: number, point: Vec2): void;
  cancel(): void;
}
/** Floating tools and products retain native pointer capture beyond their source tile. */
export class ToolTray {
  private readonly icons = new TrayIcons();
  private readonly left: TrayColumn;
  private readonly right: TrayColumn;
  private readonly ghost: Node;
  private readonly returnTarget: Node;
  private returnValid: boolean | null = null;
  private handlers: ToolHandlers | null = null;
  private active: number | null = null;
  private width = 1;
  private height = 1;
  constructor(private readonly parent: Node) {
    this.left = new TrayColumn(parent, 'ToolsLeft', () => this.cancel());
    this.right = new TrayColumn(parent, 'ProductsRight', () => this.cancel());
    for (const kind of ['sickle', 'wateringCan', 'fertilizer', 'hammer', 'saw', 'axe'] as const)
      this.tile(this.left, kind, kind === 'sickle' ? 'HarvestTool' : `${kind}Tool`);
    for (const kind of [
      'vegetable',
      'wheat',
      'lettuce',
      'wood',
      'stone',
      'chilledVegetable',
    ] as const)
      this.tile(this.right, kind, `${kind[0]!.toUpperCase()}${kind.slice(1)}Stock`);
    this.left.show(() => true);
    this.right.show((e) => e.kind !== 'chilledVegetable');
    this.returnTarget = uiNode('ProductReturnTarget', parent);
    this.returnTarget.addComponent(Graphics);
    this.returnTarget.active = false;
    this.ghost = uiNode('ToolGhost', parent);
    this.ghost.getComponent(UITransform)!.setContentSize(48, 48);
    this.ghost.active = false;
    parent.on(Node.EventType.TOUCH_START, this.otherTouch, this, true);
  }
  destination(kind: ToolKind): Node | null {
    return this.left.destination(kind) ?? this.right.destination(kind);
  }
  covers(point: { x: number; y: number }): boolean {
    return [...this.left.regions(), ...this.right.regions()].some((region) =>
      region.hitTest(new Vec2(point.x, point.y)),
    );
  }
  acceptsProductDrop(point: { x: number; y: number }): boolean {
    return this.right.regions().some((region) => region.hitTest(new Vec2(point.x, point.y)));
  }
  highlightProductDrop(point: { x: number; y: number } | null, valid: boolean): void {
    const region = point && this.right.regions().find((r) => r.hitTest(new Vec2(point.x, point.y)));
    this.returnTarget.active = !!region;
    if (!region) {
      this.returnValid = null;
      return;
    }
    this.returnTarget.setWorldPosition(region.node.worldPosition);
    if (this.returnValid === valid) return;
    this.returnValid = valid;
    const graphics = this.returnTarget.getComponent(Graphics)!;
    graphics.clear();
    graphics.lineWidth = 3;
    graphics.strokeColor = color(valid ? '#EFD377' : '#D87163');
    graphics.roundRect(-29, -29, 58, 58, 12);
    graphics.stroke();
  }
  setObscured(hidden: boolean): void {
    this.left.root.active = !hidden;
    this.right.root.active = !hidden;
  }
  setHandlers(handlers: ToolHandlers): void {
    this.handlers = handlers;
  }
  layout(width: number, height: number, top: number, bottom = 80, left = 0): void {
    this.width = width;
    this.height = height;
    const y = height / 2 - top - 30;
    const available = Math.max(56, height - top - bottom);
    this.left.layout(-width / 2 + left + 36, y, available);
    this.right.layout(width / 2 - 36, y, Math.max(56, available - 72));
  }
  setQuantity(stock: Stock, tools: Record<Tool, number>): void {
    for (const entry of this.left.entries) {
      const count = tools[entry.kind as Tool];
      entry.text.string = `${TRAY_LABELS[entry.kind]}${entry.kind === 'fertilizer' ? '×' : '·'}${count}`;
    }
    for (const entry of this.right.entries)
      entry.text.string = `${TRAY_LABELS[entry.kind]}×${stock[entry.kind as keyof Stock]}`;
    this.right.show((e) => e.kind !== 'chilledVegetable' || stock.chilledVegetable > 0);
  }
  cancel(): void {
    this.left.cancelGesture();
    this.right.cancelGesture();
    if (this.active !== null) this.handlers?.cancel();
    this.active = null;
    this.ghost.active = false;
  }
  dispose(): void {
    this.cancel();
    this.parent.off(Node.EventType.TOUCH_START, this.otherTouch, this, true);
    this.icons.dispose();
    this.left.root.destroy();
    this.right.root.destroy();
    this.ghost.destroy();
    this.returnTarget.destroy();
  }
  private otherTouch(event: EventTouch): void {
    if (event.getAllTouches().length > 1 || (this.active !== null && event.getID() !== this.active))
      this.cancel();
  }
  private tile(column: TrayColumn, kind: ToolKind, name: string): void {
    const { node: tile } = column.add(kind, name);
    const icon = uiNode(`${name}Icon`, tile);
    icon.setPosition(0, 7);
    this.icons.draw(icon, kind);
    tile.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      event.propagationStopped = true;
      if (this.active !== null || event.getAllTouches().length > 1) {
        this.cancel();
        return;
      }
      const id = event.getID() ?? 0;
      if (this.handlers?.begin(kind, id, event.getLocation()) === false) return;
      this.active = id;
      this.icons.draw(this.ghost, kind, 48);
      this.moveGhost(event);
    });
    tile.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      event.propagationStopped = true;
      if (this.active === null || (event.getID() ?? 0) !== this.active) return;
      this.moveGhost(event);
      this.handlers?.move(this.active, event.getLocation());
    });
    tile.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
      if (this.active === null || (event.getID() ?? 0) !== this.active) return;
      const id = this.active;
      this.active = null;
      this.ghost.active = false;
      this.handlers?.end(id, event.getLocation());
    });
    tile.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
      event.propagationStopped = true;
      if (this.active === null || event.getID() !== this.active) return;
      // Creator 3.8.8 rewrites normal releases outside the source tile to CANCEL.
      // This deprecated but public API retains the original hardware event code.
      if (event.getEventCode() === Node.EventType.TOUCH_END) {
        const id = this.active;
        this.active = null;
        this.ghost.active = false;
        this.handlers?.end(id, event.getLocation());
      } else this.cancel();
    });
  }
  private moveGhost(event: EventTouch): void {
    const point = event.getUILocation();
    this.ghost.setPosition(point.x - this.width / 2, point.y - this.height / 2 + 22);
    this.ghost.active = true;
  }
}
