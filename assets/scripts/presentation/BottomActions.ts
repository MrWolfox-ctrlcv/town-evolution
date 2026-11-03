import { Node, Label, LabelOutline, UITransform, UIOpacity, Vec2, Vec3, tween, Tween } from 'cc';
import { uiNode, label, consumeTouches, ActionButton } from './Widgets';
import type { Action } from './Widgets';
import { ActionArtwork } from './ActionArtwork';
import { color } from './Palette';
import { hudLayout } from '../application/HudLayout';
export type HudTab = 'build' | 'manage' | 'orders' | 'tools';
const TABS: Array<[HudTab, string]> = [
  ['build', '建造'],
  ['manage', '经营'],
  ['orders', '订单'],
  ['tools', '工具'],
];
interface ContextData {
  actions: Action[];
  rotation: Action | null;
  tab: HudTab;
  detail: string;
}
/** Transparent illustrated controls. Only a fresh selection plays the short opening motion. */
export class BottomActions {
  readonly context: Node;
  private readonly navigation: Node;
  private readonly art = new ActionArtwork();
  private readonly buttons: ActionButton[];
  private readonly tabs: ActionButton[];
  private readonly closeButton: ActionButton;
  private readonly rotate: ActionButton;
  private readonly heading: Label;
  private readonly opacity: UIOpacity;
  private requested = false;
  private animateNext = false;
  private data: ContextData | null = null;
  private screen = hudLayout(390, 844, 0);
  constructor(
    parent: Node,
    explain: (text: string) => void,
    changeTab: (tab: HudTab) => void,
    private readonly concealTrays: (hidden: boolean) => void,
  ) {
    this.navigation = uiNode('Navigation', parent);
    this.context = uiNode('Controls', parent);
    consumeTouches(this.context);
    this.opacity = this.context.addComponent(UIOpacity);
    this.context.active = false;
    this.heading = label(this.context, '', 14);
    this.heading.color = color('#FFF8DD');
    const outline = this.heading.node.addComponent(LabelOutline);
    outline.color = color('#344E3D');
    outline.width = 2;
    this.closeButton = new ActionButton(this.context, explain, this.art);
    this.closeButton.node.name = 'ContextClose';
    this.closeButton.set({ text: '关闭', run: () => this.close() });
    this.rotate = new ActionButton(this.context, explain, this.art);
    this.rotate.node.name = 'RotateBuilding';
    this.buttons = Array.from(
      { length: 6 },
      () => new ActionButton(this.context, explain, this.art),
    );
    this.tabs = TABS.map(([id, text]) => {
      const button = new ActionButton(this.navigation, explain, this.art);
      button.set({
        text,
        run: () => {
          this.open();
          changeTab(id);
        },
      });
      return button;
    });
  }
  open(): void {
    this.requested = true;
    this.animateNext = true;
  }
  close(): void {
    this.requested = false;
    this.animateNext = false;
    Tween.stopAllByTarget(this.context);
    Tween.stopAllByTarget(this.opacity);
    this.context.active = false;
    this.concealTrays(false);
  }
  cancel(): void {
    for (const button of [...this.buttons, ...this.tabs, this.rotate, this.closeButton])
      button.cancelGesture();
  }
  covers(point: { x: number; y: number }): boolean {
    return [this.context, ...this.tabs.map((b) => b.node)].some(
      (node) =>
        node.activeInHierarchy &&
        node.getComponent(UITransform)!.hitTest(new Vec2(point.x, point.y)),
    );
  }
  get noticeY(): number {
    return -this.screen.height / 2 + (this.context.active ? 108 + this.screen.panelHeight : 102);
  }
  layout(width: number, height: number): void {
    const l = (this.screen = hudLayout(width, height, this.data?.actions.length ?? 0));
    this.updateTrays();
    Tween.stopAllByTarget(this.context);
    Tween.stopAllByTarget(this.opacity);
    this.context.setScale(1, 1, 1);
    this.opacity.opacity = 255;
    this.context.setPosition(0, l.panelY);
    this.context.getComponent(UITransform)!.setContentSize(l.panelWidth, l.panelHeight);
    this.heading.node.setPosition(-48, l.detailY);
    this.heading.node.getComponent(UITransform)!.setContentSize(l.panelWidth - 112, 32);
    this.closeButton.layout(l.panelWidth / 2 - 22, l.detailY, 44, { height: 52, fontSize: 10 });
    this.rotate.layout(l.panelWidth / 2 - 72, l.detailY, 48, { height: 52, fontSize: 10 });
    const count = this.data?.actions.length ?? 0;
    this.buttons.forEach((b, i) => {
      const row = Math.floor(i / l.actionColumns),
        used = Math.min(l.actionColumns, count - row * l.actionColumns);
      b.layout(
        ((i % l.actionColumns) - (used - 1) / 2) * l.actionWidth,
        l.actionStartY - row * 82,
        l.actionWidth - 8,
        { height: 76, fontSize: 12 },
      );
    });
    const step = Math.min(78, (width - 104) / 4);
    this.tabs.forEach((b, i) =>
      b.layout((i - 1.5) * step - 36, l.tabsY, step - 4, { height: 76, fontSize: 12 }),
    );
  }
  render(data: ContextData): void {
    const relayout =
      this.data?.actions.length !== data.actions.length ||
      Boolean(this.data?.rotation) !== Boolean(data.rotation);
    this.data = data;
    this.buttons.forEach((b, i) => b.set(data.actions[i] ?? null));
    this.rotate.set(data.rotation);
    this.heading.string =
      data.tab === 'manage'
        ? data.detail.split(/\r?\n/)[0].trim()
        : { build: '建造小镇', orders: '订单', tools: '工具与小镇' }[data.tab];
    this.tabs.forEach((b, i) => b.setSelected(TABS[i]![0] === data.tab));
    if (relayout) this.layout(this.screen.width, this.screen.height);
    const visible = this.requested && (data.actions.length > 0 || Boolean(data.rotation));
    const opening = visible && (!this.context.active || this.animateNext);
    this.context.active = visible;
    this.updateTrays();
    if (opening) {
      Tween.stopAllByTarget(this.context);
      Tween.stopAllByTarget(this.opacity);
      this.context.setPosition(0, this.screen.panelY - 24);
      this.context.setScale(0.9, 0.9, 1);
      this.opacity.opacity = 0;
      tween(this.context)
        .to(
          0.24,
          { position: new Vec3(0, this.screen.panelY, 0), scale: new Vec3(1, 1, 1) },
          { easing: 'backOut' },
        )
        .start();
      tween(this.opacity).to(0.16, { opacity: 255 }).start();
    }
    this.animateNext = false;
  }
  private updateTrays(): void {
    const l = this.screen;
    this.concealTrays(
      this.context.active && l.width - l.panelWidth < 144 && l.height - 92 - l.panelHeight < 430,
    );
  }
  dispose(): void {
    this.close();
    this.art.dispose();
  }
}
