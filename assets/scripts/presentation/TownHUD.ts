import {
  Node,
  Canvas,
  Camera,
  Layers,
  UITransform,
  Label,
  view,
  screen,
  ResolutionPolicy,
  EventTouch,
} from 'cc';
import { uiNode, label, panel, consumeTouches, ActionButton } from './Widgets';
import type { Action } from './Widgets';
import { PALETTE } from './Palette';
import { CollectionFlights } from './CollectionFlights';
import type { Item, Tool } from '../domain/game';
import { RecipeHandbook } from './RecipeHandbook';
import { ToolTray } from './ToolTray';
import type { ToolHandlers } from './ToolTray';
import { hudLayout } from '../application/HudLayout';
export type HudTab = 'build' | 'manage' | 'orders' | 'tools';
const TABS: Array<[HudTab, string]> = [
  ['build', '建造'],
  ['manage', '经营'],
  ['orders', '订单'],
  ['tools', '工具'],
];
export interface HudData {
  inventory: import('../domain/game').Stock;
  tools: Record<import('../domain/game').Tool, number>;
  summary: string;
  message: string;
  detail: string;
  actions: Action[];
  rotation: Action | null;
  tab: HudTab;
}
/** Native Cocos HUD: 48px targets and two-column actions on small displays. */
export class TownHUD {
  readonly mapInput: Node;
  private readonly canvas: Node;
  private readonly top: Node;
  private readonly bottom: Node;
  private readonly summary: Label;
  private readonly message: Label;
  private readonly detail: Label;
  private readonly buttons: ActionButton[];
  private readonly rotate: ActionButton;
  private readonly tabs: ActionButton[];
  private readonly tools: ToolTray;
  private readonly handbook: RecipeHandbook;
  private readonly flights: CollectionFlights;
  private readonly cancelMultiTouch = (event: EventTouch) => {
    if (event.getAllTouches().length > 1)
      for (const button of [...this.buttons, ...this.tabs, this.rotate]) button.cancelGesture();
  };
  private lastPoint: { x: number; y: number } | null = null;
  private readonly recordPoint = (event: EventTouch) => {
    const p = event.getLocation();
    this.lastPoint = { x: p.x, y: p.y };
  };
  get collectionClick(): { x: number; y: number } | null {
    return this.lastPoint;
  }
  private lastData: HudData | null = null;
  constructor(parent: Node, explain: (text: string) => void, changeTab: (tab: HudTab) => void) {
    this.canvas = uiNode('Canvas', parent);
    this.canvas.on(Node.EventType.TOUCH_END, this.recordPoint, this, true);
    this.canvas.on(Node.EventType.TOUCH_START, this.cancelMultiTouch, this, true);
    const cam = new Node('UICamera');
    parent.addChild(cam);
    cam.setPosition(0, 0, 1000);
    const camera = cam.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.priority = 10;
    camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    camera.visibility = Layers.Enum.UI_2D;
    camera.near = 1;
    camera.far = 2000;
    const canvas = this.canvas.addComponent(Canvas);
    canvas.cameraComponent = camera;
    canvas.alignCanvasWithScreen = true;
    this.mapInput = uiNode('MapInput', this.canvas);
    this.top = uiNode('Summary', this.canvas);
    consumeTouches(this.top);
    this.summary = label(this.top, '', 17);
    this.bottom = uiNode('Controls', this.canvas);
    consumeTouches(this.bottom);
    this.message = label(this.bottom, '', 16);
    this.detail = label(this.bottom, '', 16);
    this.message.enableWrapText = false;
    this.detail.enableWrapText = false;
    this.message.node.active = false;
    this.rotate = new ActionButton(this.bottom, explain);
    this.rotate.node.name = 'RotateBuilding';
    this.rotate.set(null);
    this.buttons = Array.from({ length: 6 }, () => new ActionButton(this.bottom, explain));
    this.tabs = TABS.map(([id, title]) => {
      const button = new ActionButton(this.bottom, explain);
      button.set({ text: title, run: () => changeTab(id) });
      return button;
    });
    this.tools = new ToolTray(this.canvas);
    this.handbook = new RecipeHandbook(this.canvas);
    this.flights = new CollectionFlights(this.canvas, (kind) => this.tools.destination(kind));
    view.resizeWithBrowserSize(true);
  }
  highlightProductDrop(point: { x: number; y: number } | null, valid: boolean): void {
    this.tools.highlightProductDrop(point, valid);
  }
  acceptsProductDrop(point: { x: number; y: number }): boolean {
    return !this.handbook.covers(point) && this.tools.acceptsProductDrop(point);
  }
  coversMapPoint(point: { x: number; y: number }): boolean {
    return this.tools.covers(point) || this.handbook.covers(point);
  }
  setToolHandlers(handlers: ToolHandlers): void {
    this.tools.setHandlers(handlers);
  }
  collect(kind: Tool | Item, amount: number, source: { x: number; y: number }): void {
    this.flights.collect(kind, amount, source);
  }
  dispose(): void {
    this.canvas.off(Node.EventType.TOUCH_END, this.recordPoint, this, true);
    this.canvas.off(Node.EventType.TOUCH_START, this.cancelMultiTouch, this, true);
    this.flights.dispose();
    this.tools.dispose();
    this.handbook.dispose();
  }
  cancelTools(): void {
    this.tools.cancel();
  }
  cancelGestures(): void {
    this.handbook.cancelGesture();
    for (const button of [...this.buttons, ...this.tabs, this.rotate]) button.cancelGesture();
  }
  layout(): ReturnType<typeof hudLayout> {
    this.cancelGestures();
    const physical = screen.windowSize;
    const dpr = Math.max(1, screen.devicePixelRatio);
    // One logical unit is approximately one CSS px / platform UI point.
    const width = Math.max(1, physical.width / dpr);
    const height = Math.max(1, physical.height / dpr);
    const layout = hudLayout(
      width,
      height,
      this.lastData?.actions.length ?? 0,
      Boolean(this.lastData?.message.trim()),
    );
    view.setDesignResolutionSize(width, height, ResolutionPolicy.SHOW_ALL);
    this.canvas.getComponent(UITransform)!.setContentSize(width, height);
    this.mapInput.getComponent(UITransform)!.setContentSize(layout.mapWidth, layout.mapHeight);
    this.mapInput.setPosition((layout.left - layout.right) / 2, (layout.bottom - layout.top) / 2);
    this.tools.layout(width, height, layout.top, layout.bottom, layout.left);
    this.handbook.layout(width, height, layout.left, layout.bottom);
    const pw = layout.panelWidth;
    panel(this.top, layout.summaryWidth, 64, PALETTE.paper);
    this.top.setPosition(layout.summaryX, height / 2 - 40);
    this.summary.node.getComponent(UITransform)!.setContentSize(layout.summaryWidth - 24, 56);
    panel(this.bottom, pw, layout.panelHeight, PALETTE.paper);
    this.bottom.setPosition(layout.panelX, layout.panelY);
    const inset = this.lastData?.rotation ? 60 : 0;
    this.rotate.layout(pw / 2 - 36, layout.panelHeight / 2 - 36, 48);
    this.detail.node.setPosition(-inset / 2, layout.detailY);
    this.detail.node.getComponent(UITransform)!.setContentSize(pw - 24 - inset, 24);
    this.message.node.setPosition(-inset / 2, layout.messageY);
    this.message.node.getComponent(UITransform)!.setContentSize(pw - 24 - inset, 20);
    const bw = (pw - 32) / 2;
    this.buttons.forEach((b, i) =>
      b.layout(((i % 2 ? 1 : -1) * (bw + 8)) / 2, layout.actionStartY - Math.floor(i / 2) * 56, bw),
    );
    const tw = (pw - 40) / 4;
    this.tabs.forEach((b, i) => b.layout((i - 1.5) * (tw + 8), layout.tabsY, tw));
    return layout;
  }
  render(data: HudData): boolean {
    const changed =
      Boolean(this.lastData?.rotation) !== Boolean(data.rotation) ||
      Math.ceil((this.lastData?.actions.length ?? 0) / 2) !== Math.ceil(data.actions.length / 2);
    this.lastData = data;
    this.summary.string = data.summary;
    this.rotate.set(data.rotation);
    this.tools.setQuantity(data.inventory, data.tools);
    this.message.string = data.message.replace(/\s+/g, ' ').trim();
    this.message.node.active = Boolean(this.message.string);
    this.detail.string = data.detail.split(/\r?\n/)[0].trim();
    this.buttons.forEach((button, i) => button.set(data.actions[i] ?? null));
    // Selected tab remains readable and is marked in text, not just by color.
    this.tabs.forEach((button, i) => {
      const [id, title] = TABS[i];
      const old = button.node.getComponentInChildren(Label);
      if (old) old.string = data.tab === id ? `• ${title}` : title;
    });
    return changed;
  }
}
