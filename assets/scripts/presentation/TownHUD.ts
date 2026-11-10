import { SafeControls } from './SafeControls';
import { TerrainNavigation } from './TerrainNavigation';
import type { TerrainNavigationHandlers } from './TerrainNavigation';
import { hasMultipleContacts } from './InputProvenance';
import { RadialActions } from './RadialActions';
import type { ObjectTarget } from '../application/ObjectSelection';
import type { RadialPoint } from '../application/RadialLayout';
import { StatusToast } from './StatusToast';
import { ActionArtwork } from './ActionArtwork';
import {
  Node,
  input,
  Canvas,
  Camera,
  Layers,
  UITransform,
  view,
  screen,
  ResolutionPolicy,
  EventTouch,
  Vec2,
  Vec3,
} from 'cc';
import { uiNode, consumeTouches, ActionButton } from './Widgets';
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
  contextHeading?: boolean;
  actions: Action[];
  rotation: Action | null;
  tab: HudTab;
  target: ObjectTarget | null;
}
/** Native Cocos HUD with transparent illustrated controls and an animated bottom shelf. */
export class TownHUD {
  readonly mapInput: Node;
  private readonly uiCamera: Node;
  /** Overlay menus own input and UI rendering, while the existing world remains visible. */
  setVisible(visible: boolean): void {
    this.canvas.active = visible;
    this.uiCamera.active = visible;
  }
  private readonly canvas: Node;
  private readonly controls: SafeControls;
  private readonly top: Node;
  private readonly bottom: BottomActions;
  private readonly radial: RadialActions;
  private readonly resources: ResourceCounters;
  private readonly message: StatusToast;
  private readonly tools: ToolTray;
  private readonly handbook: RecipeHandbook;
  private readonly flights: CollectionFlights;
  private readonly settings: ActionButton;
  private readonly settingsArt = new ActionArtwork();
  private readonly cancelMultiTouch = (event: EventTouch) => {
    if (hasMultipleContacts(event, input)) {
      this.bottom.cancel();
      this.radial.cancel();
      this.settings.cancelGesture();
      this.terrainNavigation?.cancel();
    }
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
  private terrainNavigation: TerrainNavigation | null = null;
  constructor(
    parent: Node,
    explain: (text: string) => void,
    changeTab: (tab: HudTab) => void,
    openSettings?: () => void,
  ) {
    this.canvas = uiNode('Canvas', parent);
    this.canvas.on(Node.EventType.TOUCH_END, this.recordPoint, this, true);
    this.canvas.on(Node.EventType.TOUCH_START, this.cancelMultiTouch, this, true);
    const cam = new Node('UICamera');
    this.uiCamera = cam;
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
    this.controls = new SafeControls(this.canvas);
    this.top = uiNode('Summary', this.controls.root);
    consumeTouches(this.top);
    this.resources = new ResourceCounters(this.top);
    this.settings = new ActionButton(this.controls.root, explain, this.settingsArt);
    this.settings.node.name = 'Menu-settings';
    this.settings.set(
      openSettings
        ? {
            text: '设置',
            icon: 'tools',
            run: () => {
              this.handbook.close();
              openSettings();
            },
          }
        : null,
    );
    this.tools = new ToolTray(this.controls.root, this.canvas);
    this.bottom = new BottomActions(this.controls.root, explain, changeTab, (hidden) =>
      this.tools.setObscured(hidden),
    );
    this.radial = new RadialActions(this.controls.root, explain);
    this.message = new StatusToast(this.controls.root);
    this.handbook = new RecipeHandbook(this.controls.root, false, this.canvas);
    this.flights = new CollectionFlights(
      this.canvas,
      (kind) => this.tools.destination(kind),
      (kind) => this.tools.canShow(kind),
    );
    view.resizeWithBrowserSize(true);
  }
  setTerrainNavigation(handlers: TerrainNavigationHandlers): void {
    this.terrainNavigation?.dispose();
    this.terrainNavigation = new TerrainNavigation(this.controls.root, handlers);
    this.terrainNavigation.root.setSiblingIndex(this.top.getSiblingIndex() + 1);
  }
  terrainStatus(text: string): void {
    this.terrainNavigation?.render(text);
  }
  highlightProductDrop(point: { x: number; y: number } | null, valid: boolean): void {
    this.tools.highlightProductDrop(point, valid);
  }
  acceptsProductDrop(point: { x: number; y: number }): boolean {
    return !this.handbook.covers(point) && this.tools.acceptsProductDrop(point);
  }
  coversMapPoint(point: { x: number; y: number }): boolean {
    return (
      !this.controls.contains(point) ||
      (this.top.activeInHierarchy &&
        this.top.getComponent(UITransform)!.hitTest(new Vec2(point.x, point.y))) ||
      (this.settings.node.activeInHierarchy &&
        this.settings.node.getComponent(UITransform)!.hitTest(new Vec2(point.x, point.y))) ||
      (this.terrainNavigation?.covers(point) ?? false) ||
      this.tools.covers(point) ||
      this.handbook.covers(point) ||
      this.bottom.covers(point) ||
      this.radial.covers(point)
    );
  }
  projectObject(points: readonly RadialPoint[], suppressed = false): void {
    this.radial.setSuppressed(suppressed);
    const canvas = this.controls.root.getComponent(UITransform)!;
    const obstacles = [
      ...this.tools.regions(),
      ...this.handbook.regions(),
      ...(this.terrainNavigation?.regions() ?? []),
    ].map((region) => {
      const bounds = region.getBoundingBoxToWorld();
      const lo = canvas.convertToNodeSpaceAR(new Vec3(bounds.xMin, bounds.yMin));
      const hi = canvas.convertToNodeSpaceAR(new Vec3(bounds.xMax, bounds.yMax));
      return { left: lo.x, right: hi.x, bottom: lo.y, top: hi.y };
    });
    this.radial.project(points, obstacles);
  }
  openDetails(): void {
    this.bottom.open();
    this.radial.open();
  }
  closeDetails(): void {
    this.bottom.close();
    this.radial.close();
  }
  setToolHandlers(handlers: ToolHandlers): void {
    this.tools.setHandlers({
      appearance: (kind, point) => handlers.appearance?.(kind, point) ?? kind,
      move: (id, point, returning) => handlers.move(id, point, returning),
      end: (id, point, returning) => handlers.end(id, point, returning),
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
  tick(dt: number): void {
    this.flights.update(dt);
  }
  clearCollections(): void {
    this.flights.clear();
  }
  dispose(): void {
    this.canvas.off(Node.EventType.TOUCH_END, this.recordPoint, this, true);
    this.canvas.off(Node.EventType.TOUCH_START, this.cancelMultiTouch, this, true);
    this.flights.dispose();
    this.resources.dispose();
    this.message.dispose();
    this.bottom.dispose();
    this.radial.dispose();
    this.tools.dispose();
    this.handbook.dispose();
    this.settings.cancelGesture();
    this.settingsArt.dispose();
    this.terrainNavigation?.dispose();
  }
  cancelTools(): void {
    this.tools.cancel();
  }
  cancelGestures(): void {
    this.terrainNavigation?.cancel();
    this.settings.cancelGesture();
    this.handbook.cancelGesture();
    this.bottom.cancel();
    this.radial.cancel();
  }
  layout(): ReturnType<typeof hudLayout> {
    this.cancelGestures();
    const physical = screen.windowSize;
    const dpr = Math.max(1, screen.devicePixelRatio);
    // One logical unit is approximately one CSS px / platform UI point.
    const fullWidth = Math.max(1, physical.width / dpr);
    const fullHeight = Math.max(1, physical.height / dpr);
    view.setDesignResolutionSize(fullWidth, fullHeight, ResolutionPolicy.SHOW_ALL);
    this.canvas.getComponent(UITransform)!.setContentSize(fullWidth, fullHeight);
    const area = this.controls.layout(fullWidth, fullHeight);
    const { width, height } = area;
    const layout = hudLayout(
      width,
      height,
      this.lastData?.actions.length ?? 0,
      Boolean(this.lastData?.message.trim()),
    );
    this.mapInput.getComponent(UITransform)!.setContentSize(fullWidth, fullHeight);
    this.mapInput.setPosition(0, 0);
    this.tools.layout(
      width,
      height,
      this.terrainNavigation ? 136 : layout.top,
      88,
      layout.left,
      area,
    );
    this.terrainNavigation?.layout(width, height);
    this.handbook.layout(width, height, layout.left, layout.bottom);
    this.top.setPosition(layout.summaryX, height / 2 - 26);
    this.resources.layout(layout.summaryWidth);
    this.settings.layout(layout.settingsX, layout.settingsY, layout.settingsWidth, {
      height: layout.settingsHeight,
      fontSize: 16,
      theme: 'quiet',
      iconOnly: true,
    });
    this.bottom.layout(width, height);
    this.radial.layout(width, height, area);
    this.message.layout(width, height, this.bottom.noticeY);
    return {
      ...layout,
      width: fullWidth,
      height: fullHeight,
      mapWidth: fullWidth,
      mapHeight: fullHeight,
    };
  }
  render(data: HudData): boolean {
    this.lastData = data;
    this.handbook.setState(data.state);
    this.resources.render(data.state);
    this.tools.setQuantity(data.inventory, data.tools);
    this.bottom.render(data.target ? { ...data, actions: [], rotation: null } : data);
    this.radial.render(data);
    this.message.render(data.message.replace(/\s+/g, ' ').trim(), this.bottom.noticeY);
    return false;
  }
}
