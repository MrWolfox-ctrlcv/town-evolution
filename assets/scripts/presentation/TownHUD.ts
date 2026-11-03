import { StatusToast } from './StatusToast';
import {
  Node,
  Canvas,
  Camera,
  Layers,
  UITransform,
  view,
  screen,
  ResolutionPolicy,
  EventTouch,
} from 'cc';
import { uiNode, consumeTouches } from './Widgets';
import { BottomActions } from './BottomActions';
import type { HudTab } from './BottomActions';
export type { HudTab } from './BottomActions';
import type { Action } from './Widgets';
import { ResourceCounters } from './ResourceCounters';
import { CollectionFlights } from './CollectionFlights';
import type { Item, Tool } from '../domain/game';
import { RecipeHandbook } from './RecipeHandbook';
import { ToolTray } from './ToolTray';
import type { ToolHandlers } from './ToolTray';
import { hudLayout } from '../application/HudLayout';
export interface HudData {
  state: import('../domain/game').GameState;
  inventory: import('../domain/game').Stock;
  tools: Record<import('../domain/game').Tool, number>;
  summary: string;
  message: string;
  detail: string;
  actions: Action[];
  rotation: Action | null;
  tab: HudTab;
}
/** Native Cocos HUD with transparent illustrated controls and an animated bottom shelf. */
export class TownHUD {
  readonly mapInput: Node;
  private readonly canvas: Node;
  private readonly top: Node;
  private readonly bottom: BottomActions;
  private readonly resources: ResourceCounters;
  private readonly message: StatusToast;
  private readonly tools: ToolTray;
  private readonly handbook: RecipeHandbook;
  private readonly flights: CollectionFlights;
  private readonly cancelMultiTouch = (event: EventTouch) => {
    if (event.getAllTouches().length > 1) this.bottom.cancel();
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
    this.resources = new ResourceCounters(this.top);
    this.tools = new ToolTray(this.canvas);
    this.bottom = new BottomActions(this.canvas, explain, changeTab, (hidden) =>
      this.tools.setObscured(hidden),
    );
    this.message = new StatusToast(this.canvas);
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
    return this.tools.covers(point) || this.handbook.covers(point) || this.bottom.covers(point);
  }
  openDetails(): void {
    this.bottom.open();
  }
  closeDetails(): void {
    this.bottom.close();
  }
  setToolHandlers(handlers: ToolHandlers): void {
    this.tools.setHandlers({
      move: (id, point) => handlers.move(id, point),
      end: (id, point) => handlers.end(id, point),
      cancel: () => handlers.cancel(),
      begin: (kind, id, point) => {
        this.closeDetails();
        const accepted = handlers.begin(kind, id, point);
        if (accepted === false) {
          this.openDetails();
          if (this.lastData) this.render(this.lastData);
        }
        return accepted;
      },
    });
  }
  collect(kind: Tool | Item, amount: number, source: { x: number; y: number }): void {
    this.flights.collect(kind, amount, source);
  }
  dispose(): void {
    this.canvas.off(Node.EventType.TOUCH_END, this.recordPoint, this, true);
    this.canvas.off(Node.EventType.TOUCH_START, this.cancelMultiTouch, this, true);
    this.flights.dispose();
    this.resources.dispose();
    this.message.dispose();
    this.bottom.dispose();
    this.tools.dispose();
    this.handbook.dispose();
  }
  cancelTools(): void {
    this.tools.cancel();
  }
  cancelGestures(): void {
    this.handbook.cancelGesture();
    this.bottom.cancel();
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
    this.mapInput.setPosition((layout.left - layout.right) / 2, layout.bottom / 2);
    this.tools.layout(width, height, layout.top, 88, layout.left);
    this.handbook.layout(width, height, layout.left, layout.bottom);
    this.top.setPosition(layout.summaryX, height / 2 - 26);
    this.resources.layout(layout.summaryWidth);
    this.bottom.layout(width, height);
    this.message.layout(width, height, this.bottom.noticeY);
    return layout;
  }
  render(data: HudData): boolean {
    this.lastData = data;
    this.handbook.setState(data.state);
    this.resources.render(data.state);
    this.tools.setQuantity(data.inventory, data.tools);
    this.bottom.render(data);
    this.message.render(data.message.replace(/\s+/g, ' ').trim(), this.bottom.noticeY);
    return false;
  }
}
