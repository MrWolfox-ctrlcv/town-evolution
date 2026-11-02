import { Node, Camera, Vec3, Rect, geometry, Layers, EventTouch } from 'cc';
import { color } from './Palette';
import { fittedOrthoHeight } from '../application/CameraFraming';
import { TapGesture } from '../application/TapGesture';
/** Orthographic camera, map-plane picking and one-finger pan. */
export class MapCamera {
  private readonly camera: Camera;
  private readonly focus = new Vec3(6, 0, 6);
  private readonly gesture = new TapGesture();
  private zoom = 1;
  private aspect = 1;
  private mapHeight = 400;
  private input: Node;
  constructor(
    parent: Node,
    input: Node,
    onTap: (point: { x: number; z: number }, ray: geometry.Ray) => void,
  ) {
    // Full-screen clear keeps margins outside the map viewport deterministic.
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
    this.input = input;
    input.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      this.gesture.begin(e.getID() ?? 0, e.getUILocation());
    });
    input.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
      if (!this.gesture.move(e.getID() ?? 0, e.getUILocation())) return;
      const d = e.getUIDelta();
      const scale = (this.camera.orthoHeight * 2) / this.mapHeight;
      this.focus.x = Math.max(-2, Math.min(14, this.focus.x - (d.x + d.y) * scale * 0.7));
      this.focus.z = Math.max(-2, Math.min(14, this.focus.z + (d.x - d.y) * scale * 0.7));
      this.update();
    });
    input.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (!this.gesture.end(e.getID() ?? 0)) return;
      const ray = new geometry.Ray();
      this.camera.screenPointToRay(e.getLocationX(), e.getLocationY(), ray);
      const point = this.pick(ray);
      if (point) onTap(point, ray);
    });
    input.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => this.gesture.cancel(e.getID() ?? 0));
  }
  cancelGesture(): void {
    this.gesture.cancel();
  }
  layout(width: number, height: number, bottom: number, top: number, right = 0): void {
    this.cancelGesture();
    this.mapHeight = Math.max(1, height - bottom - top);
    this.aspect = Math.max(1, width - right) / this.mapHeight;
    this.camera.rect = new Rect(
      0,
      bottom / height,
      Math.max(1, width - right) / width,
      this.mapHeight / height,
    );
    this.update();
  }
  zoomBy(delta: number): void {
    this.zoom = Math.max(0.45, Math.min(1.8, this.zoom + delta * 0.12));
    this.update();
  }
  reset(): void {
    this.focus.set(6, 0, 6);
    this.zoom = 1;
    this.update();
  }
  private update(): void {
    this.camera.orthoHeight = fittedOrthoHeight(this.aspect) * this.zoom;
    this.camera.node.setPosition(this.focus.x + 15, 20, this.focus.z + 18);
    this.camera.node.lookAt(this.focus);
  }
  private pick(ray: geometry.Ray): { x: number; z: number } | null {
    if (Math.abs(ray.d.y) < 0.00001) return null;
    const t = -ray.o.y / ray.d.y;
    if (t < 0) return null;
    return { x: Math.floor(ray.o.x + ray.d.x * t), z: Math.floor(ray.o.z + ray.d.z * t) };
  }
  dispose(): void {
    this.input.active = false;
    this.input.destroy();
  }
}
