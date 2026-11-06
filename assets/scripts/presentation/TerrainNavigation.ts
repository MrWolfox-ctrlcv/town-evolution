import { Node, Label, LabelOutline, UITransform, Vec2 } from 'cc';
import { ActionButton, consumeTouches, label, uiNode } from './Widgets';
import { color } from './Palette';
export interface TerrainNavigationHandlers {
  home(): void;
  overview(): void;
  zoom(delta: number): void;
}
/** V6-only view controls stay reachable even when the six-slot context shelf is full. */
export class TerrainNavigation {
  readonly root: Node;
  private readonly buttons: ActionButton[];
  private readonly status: Label;
  constructor(parent: Node, handlers: TerrainNavigationHandlers) {
    this.root = uiNode('TerrainNavigation', parent);
    consumeTouches(this.root);
    this.buttons = [
      { text: '回家', run: () => handlers.home() },
      { text: '全岛', run: () => handlers.overview() },
      { text: '＋', run: () => handlers.zoom(-1) },
      { text: '−', run: () => handlers.zoom(1) },
    ].map((action) => {
      const button = new ActionButton(this.root, () => {});
      button.node.name = `TerrainView:${action.text}`;
      button.set(action);
      return button;
    });
    this.status = label(this.root, '', 12);
    this.status.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.status.color = color('#FFF9E8');
    const outline = this.status.node.addComponent(LabelOutline);
    outline.color = color('#284540');
    outline.width = 2;
  }
  layout(width: number, height: number): void {
    this.cancel();
    this.root.setPosition(0, height / 2 - 93);
    this.root.getComponent(UITransform)!.setContentSize(Math.max(1, width - 24), 80);
    const cell = Math.min(62, Math.max(44, (width - 36) / 4));
    this.buttons.forEach((button, i) =>
      button.layout((i - 1.5) * cell, 17, cell - 4, { height: 44, fontSize: 15, theme: 'quiet' }),
    );
    this.status.node.setPosition(0, -23);
    this.status.node.getComponent(UITransform)!.setContentSize(Math.max(1, width - 28), 32);
  }
  render(text: string): void {
    this.status.string = text;
  }
  covers(point: { x: number; y: number }): boolean {
    return (
      this.root.activeInHierarchy &&
      this.root.getComponent(UITransform)!.hitTest(new Vec2(point.x, point.y))
    );
  }
  regions(): UITransform[] {
    return this.root.activeInHierarchy ? [this.root.getComponent(UITransform)!] : [];
  }
  cancel(): void {
    for (const button of this.buttons) button.cancelGesture();
  }
  dispose(): void {
    this.cancel();
    this.root.destroy();
  }
}
