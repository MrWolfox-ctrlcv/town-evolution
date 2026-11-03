import { Node, Camera, Vec3, Rect, geometry, Layers, EventTouch, EventMouse, screen } from 'cc';
import { CONFIG } from '../domain/game';
import { color } from './Palette';
import { fittedOrthoHeight, homeZoom } from '../application/CameraFraming';
import { MapGesture } from '../application/MapGesture';
import type { Point } from '../application/MapGesture';
export interface MapHooks {
  covered(point: Point): boolean;
  tap(point: { x: number; z: number }, ray: geometry.Ray): void;
  candidate(ray: geometry.Ray): string | null;
  drag(id: string, point: Vec3, ray: geometry.Ray | null, screen: Point): void;
  drop(id: string, ray: geometry.Ray | null, screen: Point): void;
  cancel(): void;
}
/** Screen-ground anchored pan and zoom; gesture classification lives outside Cocos. */
export class MapCamera {
  private readonly camera: Camera;
  private readonly focus = new Vec3(6, 0, 6);
  private readonly gesture: MapGesture;
  private readonly eventRoot: Node;
  private readonly contacts = new Set<number>();
  private readonly globalStart = (e: EventTouch) => {
    this.contacts.add(e.getID() ?? 0);
    if (this.contacts.size > 1) this.gesture.interrupt();
  };
  private readonly globalEnd = (e: EventTouch) => {
    this.contacts.delete(e.getID() ?? 0);
  };
  private zoom = homeZoom(CONFIG.gridSize);
  private aspect = 1;
  constructor(
    parent: Node,
    private readonly input: Node,
    private readonly hooks: MapHooks,
  ) {
    this.eventRoot = input.parent!;
    const backdrop = new Node('BackgroundCamera');
    parent.addChild(backdrop);
    const background = backdrop.addComponent(Camera);
    background.priority = -1;
    background.visibility = 0;
    background.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    background.clearColor = color('#77B8B6');
    const node = new Node('WorldCamera');
    parent.addChild(node);
    this.camera = node.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.clearColor = color('#77B8B6');
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.visibility = Layers.Enum.DEFAULT;
    this.gesture = new MapGesture({
      candidate: (p) => hooks.candidate(this.screenRay(p)),
      tap: (p) => {
        const world = this.ground(p);
        if (world && this.contains(p))
          hooks.tap({ x: Math.floor(world.x), z: Math.floor(world.z) }, this.screenRay(p));
      },
      pan: (from, to) => this.anchor(from, to),
      pinch: (from, to, ratio) => this.zoomAt(ratio, from, to),
      drag: (id, p) => {
        const world = this.ground(p);
        if (world) hooks.drag(id, world, this.contains(p) ? this.screenRay(p) : null, p);
      },
      drop: (id, p) => hooks.drop(id, this.contains(p) ? this.screenRay(p) : null, p),
      cancel: () => hooks.cancel(),
    });
    this.eventRoot.on(Node.EventType.TOUCH_START, this.globalStart, this, true);
    this.eventRoot.on(Node.EventType.TOUCH_END, this.globalEnd, this, true);
    this.eventRoot.on(Node.EventType.TOUCH_CANCEL, this.globalEnd, this, true);
    input.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      const id = e.getID() ?? 0;
      const outsideContact = [...this.contacts].some(
        (other) => other !== id && !this.gesture.has(other),
      );
      this.gesture.begin(id, e.getLocation(), e.getUILocation());
      if (outsideContact) this.gesture.interrupt();
    });
    input.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) =>
      this.gesture.move(e.getID() ?? 0, e.getLocation(), e.getUILocation()),
    );
    input.on(Node.EventType.TOUCH_END, (e: EventTouch) =>
      this.gesture.end(e.getID() ?? 0, e.getLocation()),
    );
    input.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => {
      // Cocos rewrites releases outside the captured map node to CANCEL.
      if (e.getEventCode() === Node.EventType.TOUCH_END)
        this.gesture.end(e.getID() ?? 0, e.getLocation());
      else this.cancelGesture();
    });
    input.on(Node.EventType.MOUSE_WHEEL, (e: EventMouse) => {
      this.cancelGesture();
      const p = e.getLocation();
      if (this.contains(p))
        this.zoomAt(Math.exp(-Math.max(-500, Math.min(500, e.getScrollY())) * 0.002), p, p);
      e.propagationStopped = true;
    });
  }
  tick(): void {
    this.gesture.poll();
  }
  resetInput(): void {
    this.contacts.clear();
    this.cancelGesture();
  }
  cancelGesture(): void {
    this.gesture.clear();
  }
  layout(width: number, height: number, bottom: number, top: number, right = 0, left = 0): void {
    this.cancelGesture();
    const mapHeight = Math.max(1, height - bottom - top);
    this.aspect = Math.max(1, width - right - left) / mapHeight;
    this.camera.rect = new Rect(
      left / width,
      bottom / height,
      Math.max(1, width - right - left) / width,
      mapHeight / height,
    );
    this.update();
  }
  zoomBy(delta: number): void {
    this.zoom = Math.max(0.15, Math.min(1.8, this.zoom + delta * 0.12));
    this.update();
  }
  overview(): void {
    this.focus.set(CONFIG.gridSize / 2, 0, CONFIG.gridSize / 2);
    this.zoom = 1;
    this.update();
  }
  reset(): void {
    this.focus.set(6, 0, 6);
    this.zoom = homeZoom(CONFIG.gridSize);
    this.update();
  }
  project(point: { x: number; y: number; z: number }): Point {
    const p = this.camera.worldToScreen(new Vec3(point.x, point.y, point.z));
    return { x: p.x, y: p.y };
  }
  screenRay(p: Point): geometry.Ray {
    const ray = new geometry.Ray();
    this.camera.screenPointToRay(p.x, p.y, ray);
    return ray;
  }
  ground(p: Point, height = 0): Vec3 | null {
    const ray = this.screenRay(p);
    if (Math.abs(ray.d.y) < 0.00001) return null;
    const t = (height - ray.o.y) / ray.d.y;
    return t < 0 ? null : new Vec3(ray.o.x + ray.d.x * t, 0, ray.o.z + ray.d.z * t);
  }
  contains(p: Point): boolean {
    if (this.hooks.covered(p)) return false;
    const viewport = this.camera.rect;
    const size = screen.windowSize;
    const x = p.x / size.width,
      y = p.y / size.height;
    return (
      x >= viewport.x &&
      y >= viewport.y &&
      x <= viewport.x + viewport.width &&
      y <= viewport.y + viewport.height
    );
  }
  private anchor(from: Point, to: Point): void {
    const before = this.ground(from),
      after = this.ground(to);
    if (before && after) this.shift(before, after);
  }
  private zoomAt(ratio: number, from: Point, to: Point): void {
    const before = this.ground(from);
    this.zoom = Math.max(0.15, Math.min(1.8, this.zoom * ratio));
    this.update();
    const after = this.ground(to);
    if (before && after) this.shift(before, after);
  }
  private shift(before: Vec3, after: Vec3): void {
    this.focus.x = Math.max(-4, Math.min(CONFIG.gridSize + 4, this.focus.x + before.x - after.x));
    this.focus.z = Math.max(-4, Math.min(CONFIG.gridSize + 4, this.focus.z + before.z - after.z));
    this.update();
  }
  private update(): void {
    this.camera.orthoHeight = fittedOrthoHeight(this.aspect, CONFIG.gridSize) * this.zoom;
    this.camera.node.setPosition(this.focus.x + 15, 20, this.focus.z + 18);
    this.camera.node.lookAt(this.focus);
    this.camera.camera.update();
  }
  dispose(): void {
    this.eventRoot.off(Node.EventType.TOUCH_START, this.globalStart, this, true);
    this.eventRoot.off(Node.EventType.TOUCH_END, this.globalEnd, this, true);
    this.eventRoot.off(Node.EventType.TOUCH_CANCEL, this.globalEnd, this, true);
    this.contacts.clear();
    this.cancelGesture();
    this.input.active = false;
    this.input.destroy();
  }
}
