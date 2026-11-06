import { Node, Label, LabelOutline, UITransform, Vec2, view } from 'cc';
import { uiNode, label, ActionButton } from './Widgets';
import type { Action } from './Widgets';
import { ActionArtwork } from './ActionArtwork';
import { color } from './Palette';
import { collectionSource } from '../application/CollectionPath';
import { objectKey } from '../application/ObjectSelection';
import type { ObjectTarget } from '../application/ObjectSelection';
import { radialLayout, screenBounds } from '../application/RadialLayout';
import type { RadialPoint, RadialRect } from '../application/RadialLayout';
export interface RadialData {
  target: ObjectTarget | null;
  actions: Action[];
  rotation: Action | null;
  detail: string;
}
/** Only the individual buttons capture input. The model and the gaps stay draggable. */
export class RadialActions {
  private readonly root: Node;
  private readonly art = new ActionArtwork();
  private readonly buttons: ActionButton[];
  private readonly heading: Label;
  private data: RadialData | null = null;
  private requested = false;
  private suppressed = false;
  private selection = '';
  private page = 0;
  private width = 390;
  private height = 844;
  private anchor: RadialRect | null = null;
  private obstacles: readonly RadialRect[] = [];
  private signature = '';
  private dirty = true;
  private placed: ReturnType<typeof radialLayout> | null = null;
  constructor(parent: Node, explain: (text: string) => void) {
    this.root = uiNode('ObjectRadialActions', parent);
    this.root.getComponent(UITransform)!.setContentSize(0, 0);
    this.root.active = false;
    this.heading = label(this.root, '', 12);
    this.heading.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.heading.color = color('#FFF9E6');
    const outline = this.heading.node.addComponent(LabelOutline);
    outline.color = color('#344E3D');
    outline.width = 2;
    this.buttons = Array.from({ length: 8 }, (_, i) => {
      const button = new ActionButton(this.root, explain, this.art);
      button.node.name = `ObjectAction-${i}`;
      return button;
    });
  }
  open(): void {
    this.requested = true;
    this.signature = '';
  }
  close(): void {
    this.requested = false;
    this.cancel();
    this.root.active = false;
  }
  cancel(): void {
    this.buttons.forEach((button) => button.cancelGesture());
  }
  setSuppressed(suppressed: boolean): void {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    this.signature = '';
    this.cancel();
    this.place();
  }
  covers(point: RadialPoint): boolean {
    return this.buttons.some(
      (button) =>
        button.node.activeInHierarchy &&
        button.node.getComponent(UITransform)!.hitTest(new Vec2(point.x, point.y)),
    );
  }
  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.signature = '';
    this.cancel();
    this.place();
  }
  render(data: RadialData): void {
    const key = data.target ? objectKey(data.target) : '';
    if (key !== this.selection) {
      this.cancel();
      this.page = 0;
      this.anchor = null;
      this.signature = '';
      this.selection = key;
    }
    this.data = data;
    this.dirty = true;
    this.heading.string = data.detail.replace(/\s+/g, ' ').trim();
    this.place();
  }
  project(points: readonly RadialPoint[], obstacles: readonly RadialRect[]): void {
    const viewport = view.getViewportRect();
    this.anchor = screenBounds(
      points.map((point) =>
        collectionSource(
          point,
          viewport,
          { x: view.getScaleX(), y: view.getScaleY() },
          { x: this.width, y: this.height },
        ),
      ),
    );
    this.obstacles = obstacles;
    this.place();
  }
  private place(): void {
    this.root.active = !!this.data?.target && this.requested && !this.suppressed && !!this.anchor;
    if (!this.root.active || !this.anchor || !this.data) return;
    const actions = [...this.data.actions, ...(this.data.rotation ? [this.data.rotation] : [])];
    const signature = JSON.stringify([
      this.width,
      this.height,
      Object.values(this.anchor).map((n) => Math.round(n)),
      this.obstacles,
      actions.map((a) => [a.text, a.enabled, a.icon]),
      this.page,
    ]);
    if (signature === this.signature && !this.dirty) return;
    if (signature !== this.signature || !this.placed) {
      this.signature = signature;
      this.cancel();
      this.placed = radialLayout(
        this.width,
        this.height,
        this.anchor,
        actions.length + 1,
        this.obstacles,
      );
    }
    this.dirty = false;
    const layout = this.placed;
    const slots = layout.positions.length;
    const close: Action = { text: '关闭', run: () => this.close() };
    let visible = [...actions, close];
    if (visible.length > slots && slots >= 2) {
      const size = Math.max(1, slots - 2),
        pages = Math.ceil(actions.length / size);
      this.page %= pages;
      visible = [
        ...actions.slice(this.page * size, (this.page + 1) * size),
        {
          text: `更多 ${this.page + 1}/${pages}`,
          icon: 'quantity',
          run: () => {
            this.page = (this.page + 1) % pages;
            this.signature = '';
            this.place();
          },
        },
        ...(slots > 2 ? [close] : []),
      ];
    }
    this.buttons.forEach((button, i) => {
      const position = layout.positions[i],
        action = visible[i];
      button.set(position && action ? action : null);
      if (position)
        button.layout(position.x, position.y, layout.buttonWidth, {
          height: layout.buttonHeight,
          fontSize: 11,
        });
    });
    this.heading.node.active = !!layout.heading;
    if (layout.heading) {
      this.heading.node.setPosition(layout.heading.x, layout.heading.y);
      this.heading.node.getComponent(UITransform)!.setContentSize(layout.headingWidth, 32);
    }
  }
  dispose(): void {
    this.close();
    this.art.dispose();
    this.root.destroy();
  }
}
