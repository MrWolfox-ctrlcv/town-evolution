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
} from 'cc';
import { uiNode, label, panel, consumeTouches, ActionButton } from './Widgets';
import type { Action } from './Widgets';
import { PALETTE } from './Palette';
import { hudLayout } from '../application/HudLayout';
export type HudTab = 'build' | 'manage' | 'orders' | 'tools';
const TABS: Array<[HudTab, string]> = [
  ['build', '建造'],
  ['manage', '经营'],
  ['orders', '订单'],
  ['tools', '工具'],
];
export interface HudData {
  summary: string;
  message: string;
  detail: string;
  actions: Action[];
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
  private readonly tabs: ActionButton[];
  private lastData: HudData | null = null;
  constructor(parent: Node, explain: (text: string) => void, changeTab: (tab: HudTab) => void) {
    this.canvas = uiNode('Canvas', parent);
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
    this.buttons = Array.from({ length: 4 }, () => new ActionButton(this.bottom, explain));
    this.tabs = TABS.map(([id, title]) => {
      const button = new ActionButton(this.bottom, explain);
      button.set({ text: title, run: () => changeTab(id) });
      return button;
    });
    view.resizeWithBrowserSize(true);
  }
  cancelGestures(): void {
    for (const button of [...this.buttons, ...this.tabs]) button.cancelGesture();
  }
  layout(): ReturnType<typeof hudLayout> {
    this.cancelGestures();
    const physical = screen.windowSize;
    const dpr = Math.max(1, screen.devicePixelRatio);
    // One logical unit is approximately one CSS px / platform UI point.
    const width = Math.max(1, physical.width / dpr);
    const height = Math.max(1, physical.height / dpr);
    const layout = hudLayout(width, height, this.lastData?.actions.length ?? 0);
    view.setDesignResolutionSize(width, height, ResolutionPolicy.SHOW_ALL);
    this.canvas.getComponent(UITransform)!.setContentSize(width, height);
    this.mapInput.getComponent(UITransform)!.setContentSize(layout.mapWidth, layout.mapHeight);
    this.mapInput.setPosition(-layout.right / 2, (layout.bottom - layout.top) / 2);
    const pw = layout.panelWidth;
    panel(this.top, layout.summaryWidth, 64, PALETTE.paper);
    this.top.setPosition(layout.summaryX, height / 2 - 40);
    this.summary.node.getComponent(UITransform)!.setContentSize(layout.summaryWidth - 24, 56);
    panel(this.bottom, pw, layout.panelHeight, PALETTE.paper);
    this.bottom.setPosition(layout.panelX, layout.panelY);
    const half = layout.panelHeight / 2;
    this.message.node.setPosition(0, half - 26);
    this.message.node.getComponent(UITransform)!.setContentSize(pw - 24, 36);
    this.detail.node.setPosition(0, half - 69);
    this.detail.node.getComponent(UITransform)!.setContentSize(pw - 24, 44);
    const bw = (pw - 32) / 2;
    this.buttons.forEach((b, i) =>
      b.layout(((i % 2 ? 1 : -1) * (bw + 8)) / 2, half - 120 - Math.floor(i / 2) * 56, bw),
    );
    const tw = (pw - 40) / 4;
    this.tabs.forEach((b, i) => b.layout((i - 1.5) * (tw + 8), -half + 32, tw));
    return layout;
  }
  render(data: HudData): boolean {
    const changed =
      Math.ceil((this.lastData?.actions.length ?? 0) / 2) !== Math.ceil(data.actions.length / 2);
    this.lastData = data;
    this.summary.string = data.summary;
    this.message.string = data.message;
    this.detail.string = data.detail;
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
