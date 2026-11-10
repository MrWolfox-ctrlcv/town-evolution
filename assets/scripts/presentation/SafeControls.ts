import { Node, UITransform, Vec2 } from 'cc';
import { uiNode } from './Widgets';
import { safeViewport } from './SafeViewport';

/** Insets controls, never the world camera or the full-canvas input root. */
export class SafeControls {
  readonly root: Node;
  constructor(parent: Node) {
    this.root = uiNode('SafeControls', parent);
  }
  layout(fullWidth: number, fullHeight: number) {
    const safe = safeViewport(fullWidth, fullHeight);
    this.root.active = safe.width > 0 && safe.height > 0;
    // A wholly hidden canvas has no interactive controls. Keep dormant layout valid.
    const area = this.root.active ? safe : { x: 0, y: 0, width: fullWidth, height: fullHeight };
    this.root.setPosition(
      area.x + area.width / 2 - fullWidth / 2,
      area.y + area.height / 2 - fullHeight / 2,
    );
    this.root.getComponent(UITransform)!.setContentSize(area.width, area.height);
    return area;
  }
  contains(point: { x: number; y: number }): boolean {
    return (
      this.root.activeInHierarchy &&
      this.root.getComponent(UITransform)!.hitTest(new Vec2(point.x, point.y))
    );
  }
}
