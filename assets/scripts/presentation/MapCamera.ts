import * as visibility from './CameraVisibility';
import type { WorldPoint } from '../application/WorldVisibility';
import {
  Node,
  Camera,
  Vec3,
  Rect,
  geometry,
  Layers,
  EventTouch,
  EventMouse,
  screen,
  input as engineInput,
} from 'cc';
import type { Touch } from 'cc';
import { worldSize, type TerrainVersion } from '../domain/world';
import { color } from './Palette';
import { markTouchRay } from './TouchPicking';
import { isTouchEvent, inputOwner, hasMultipleContacts, hasInputConflict } from './InputProvenance';
import { fitTownShadowDepth } from './SceneLighting';
import {
  cameraDepth,
  V6_VIEW_TOP,
  clampMapZoom,
  fittedOrthoHeight,
  homeZoom,
  steppedMapZoom,
} from '../application/CameraFraming';
import { MapGesture, type Point } from '../application/MapGesture';
import type { MapHooks } from './MapCameraHooks';
export class MapCamera {
  private readonly camera: Camera;
  private readonly focus = new Vec3(6, 0, 6);
  private readonly gesture: MapGesture;
  private readonly eventRoot: Node;
  private readonly contacts = new Set<number>();
  private readonly owners = new Map<number, string>();
  private readonly contactTouches = new Map<number, Touch>();
  private readonly globalStart = (e: EventTouch) => {
    const id = e.getID() ?? 0;
    const touches = engineInput?.getAllTouches();
    const ids = touches?.map((touch) => touch.getID());
    if (ids?.includes(id) && ids.every(Number.isInteger) && new Set(ids).size === ids.length) {
      const live = new Map(touches!.map((touch) => [touch.getID(), touch]));
      for (const old of this.contacts) {
        const previous = this.contactTouches.get(old);
        if (!live.has(old) || (previous && previous !== live.get(old))) {
          this.contacts.delete(old);
          this.contactTouches.delete(old);
          this.gesture.discard(old);
          this.owners.delete(old);
        }
      }
      this.contactTouches.set(id, live.get(id)!);
    }
    this.contacts.add(id);
    if (this.contacts.size > 1 || hasMultipleContacts(e, engineInput)) this.gesture.interrupt();
  };
  private readonly globalEnd = (e: EventTouch) => {
    const id = e.getID() ?? 0;
    if (e.target !== this.input || this.owners.get(id) !== inputOwner(e)) {
      this.gesture.discard(id);
      this.owners.delete(id);
    }
    this.contacts.delete(id);
    this.contactTouches.delete(id);
  };
  private size: number;
  private zoom: number;
  navigationRevision = 0;
  overhead = false;
  toggleOverhead(): boolean {
    this.cancelGesture();
    this.overhead = !this.overhead;
    this.navigationRevision++;
    this.update();
    return this.overhead;
  }
  private aspect = 1;
  constructor(
    parent: Node,
    private readonly input: Node,
    private readonly hooks: MapHooks,
    private terrainVersion: TerrainVersion = 4,
  ) {
    this.size = worldSize(terrainVersion);
    this.zoom = homeZoom(this.size);
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
    this.camera.clearColor = color('#77B8B6'); // Safe fallback if the sky effect is unavailable.
    this.camera.clearFlags = parent.scene?.globals?.skybox.enabled
      ? Camera.ClearFlag.SKYBOX
      : Camera.ClearFlag.SOLID_COLOR;
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
      if (this.owners.has(id) && this.owners.get(id) !== inputOwner(e)) this.gesture.discard(id);
      this.owners.set(id, inputOwner(e));
      this.gesture.begin(id, this.pointer(e), e.getUILocation());
      if (outsideContact || hasInputConflict(engineInput)) this.gesture.interrupt();
    });
    input.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
      if (this.accepts(e)) this.gesture.move(e.getID() ?? 0, this.pointer(e), e.getUILocation());
    });
    input.on(Node.EventType.TOUCH_END, (e: EventTouch) => this.end(e));
    input.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => {
      if (e.getEventCode() === Node.EventType.TOUCH_END) this.end(e);
      else this.cancelGesture();
    });
    input.on(Node.EventType.MOUSE_WHEEL, (e: EventMouse) => {
      e.propagationStopped = true;
      const delta = e.getScrollY();
      if (!Number.isFinite(delta) || delta === 0) return;
      this.cancelGesture();
      const p = e.getLocation();
      if (this.contains(p))
        this.zoomAt(Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.002), p, p);
    });
  }
  visibleBounds(maxHeight = 64) {
    return visibility.cameraVisibleBounds(this.camera, maxHeight);
  }
  get interacting(): boolean {
    return this.gesture.interacting;
  }
  readonly tick = (): void => this.gesture.poll();
  resetInput(): void {
    this.contacts.clear();
    this.contactTouches.clear();
    this.cancelGesture();
  }
  cancelGesture(): void {
    this.owners.clear();
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
    this.cancelGesture();
    this.zoom = steppedMapZoom(this.zoom, delta, this.size);
    this.update();
  }
  overview(): void {
    this.cancelGesture();
    this.focus.set(this.size / 2, 0, this.size / 2);
    this.zoom = 1;
    this.update();
  }
  reset(terrainVersion?: TerrainVersion, frame = { x: 6, z: 6, zoomScale: 1 }): void {
    this.cancelGesture();
    this.terrainVersion = terrainVersion ?? this.terrainVersion;
    if (terrainVersion !== undefined) this.size = worldSize(terrainVersion);
    this.focus.set(frame.x, 0, frame.z);
    this.zoom = homeZoom(this.size) * frame.zoomScale;
    this.update();
  }
  project(point: { x: number; y: number; z: number }): Point {
    const p = this.camera.worldToScreen(new Vec3(point.x, point.y, point.z));
    return { x: p.x, y: p.y };
  }
  screenRay(p: Point): geometry.Ray {
    const ray = new geometry.Ray();
    this.camera.screenPointToRay(p.x, p.y, ray);
    return p.touch === true
      ? markTouchRay(ray, {
          point: { x: p.x, y: p.y },
          radius: 6 * screen.devicePixelRatio,
          project: (world) => this.project(world),
          ray: (point) => this.screenRay({ x: point.x, y: point.y }),
          contains: (point) => this.contains(point),
        })
      : ray;
  }
  private accepts(event: EventTouch): boolean {
    const id = event.getID() ?? 0;
    if (this.owners.get(id) === inputOwner(event)) return true;
    this.gesture.discard(id);
    this.owners.delete(id);
    return false;
  }
  private end(event: EventTouch): void {
    if (this.accepts(event)) {
      const p = this.pointer(event),
        size = screen.windowSize;
      if (p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height)
        this.gesture.discard(event.getID() ?? 0);
      else this.gesture.end(event.getID() ?? 0, p, event.getUILocation());
    }
    this.owners.delete(event.getID() ?? 0);
  }
  private pointer(event: EventTouch): Point {
    return Object.assign(event.getLocation(), { touch: isTouchEvent(event) });
  }
  ground(p: Point, height?: number): Vec3 | null {
    const ray = this.screenRay(p);
    if (height === undefined && this.hooks.ground) {
      const point = this.hooks.ground(ray);
      return point ? new Vec3(point.x, point.y, point.z) : null;
    }
    if (Math.abs(ray.d.y) < 0.00001) return null;
    const t = ((height ?? 0) - ray.o.y) / ray.d.y;
    return t < 0 ? null : new Vec3(ray.o.x + ray.d.x * t, height ?? 0, ray.o.z + ray.d.z * t);
  }
  contains(p: Point): boolean {
    return !this.hooks.covered(p) && visibility.cameraContainsPoint(this.camera, p);
  }
  boxVisible(min: Readonly<WorldPoint>, max: Readonly<WorldPoint>): boolean {
    return visibility.cameraSceneBoxVisible(this.camera, min, max);
  }
  readonly maxOverviewError = () =>
    visibility.cameraTerrainError(this.camera, fittedOrthoHeight(this.aspect, this.size));
  maxTerrainError(): number {
    return visibility.cameraTerrainError(this.camera);
  }
  private anchor(from: Point, to: Point): void {
    const before = this.ground(from, 0),
      after = this.ground(to, 0);
    if (before && after) this.shift(before, after);
  }
  private zoomAt(ratio: number, from: Point, to: Point): void {
    const before = this.ground(from, 0),
      zoom = this.zoom;
    this.zoom = clampMapZoom(this.zoom * ratio, this.size);
    if (this.zoom !== zoom) this.navigationRevision++;
    this.update();
    const after = this.ground(to, 0);
    if (before && after) this.shift(before, after);
  }
  private shift(before: Vec3, after: Vec3): void {
    const { x, z } = this.focus;
    this.focus.x = Math.max(-4, Math.min(this.size + 4, this.focus.x + before.x - after.x));
    this.focus.z = Math.max(-4, Math.min(this.size + 4, this.focus.z + before.z - after.z));
    if (this.focus.x !== x || this.focus.z !== z) this.navigationRevision++;
    this.update();
  }
  private update(): void {
    this.camera.orthoHeight = fittedOrthoHeight(this.aspect, this.size) * this.zoom;
    const top = this.terrainVersion === 6 || this.terrainVersion === 7 ? V6_VIEW_TOP : undefined;
    const depth = cameraDepth(this.size, this.camera.orthoHeight, top, this.overhead);
    this.camera.near = depth.near;
    this.camera.far = depth.far;
    this.camera.node.setPosition(this.focus.x + depth.x, depth.y, this.focus.z + depth.z);
    this.camera.node.lookAt(this.focus, this.overhead ? new Vec3(0, 0, -1) : undefined);
    fitTownShadowDepth(this.camera, top);
    this.camera.camera.update();
  }
  dispose(): void {
    this.eventRoot.off(Node.EventType.TOUCH_START, this.globalStart, this, true);
    this.eventRoot.off(Node.EventType.TOUCH_END, this.globalEnd, this, true);
    this.eventRoot.off(Node.EventType.TOUCH_CANCEL, this.globalEnd, this, true);
    this.resetInput();
    this.input.active = false;
    this.input.destroy();
  }
}
