import { Scene, Node, Camera, Color, Vec3, input, Input, EventMouse, EventTouch } from 'cc';
import { AssetRenderer } from '../../assets/scripts/presentation/AssetRenderer';
import { configureTownLighting } from '../../assets/scripts/presentation/SceneLighting';

/** Asset-only review using the same actual Cocos meshes/materials as the game. No save is loaded. */
export function buildingReview(scene: Scene): void {
  configureTownLighting(scene);
  const renderer = new AssetRenderer();
  const cameraNode = new Node('BuildingReviewCamera');
  scene.addChild(cameraNode);
  const camera = cameraNode.addComponent(Camera);
  camera.projection = Camera.ProjectionType.ORTHO;
  camera.orthoHeight = 2.25;
  camera.clearColor = new Color(246, 239, 224, 255);
  camera.near = 0.1;
  camera.far = 100;
  cameraNode.setPosition(6, 4.8, 8);
  cameraNode.lookAt(new Vec3(0, 0.85, 0));
  const models: Node[] = [];
  ['house', 'warehouse-base', 'shop'].forEach((id, i) => {
    const model = renderer.create(id, id);
    scene.addChild(model);
    model.setPosition((i - 1) * 2.08, 0, -(i - 1) * 1.56);
    models.push(model);
  });
  const props = renderer.create('order-board');
  scene.addChild(props);
  props.setPosition(-2.75, 0, 3.15);
  props.setScale(0.72, 0.72, 0.72);
  const crate = renderer.create('crate');
  scene.addChild(crate);
  crate.setPosition(-1.8, 0, 3.1);
  crate.setScale(0.85, 0.85, 0.85);
  let dragging = false,
    angle = 0;
  const rotate = (delta: number) => {
    angle += delta * 0.45;
    for (const model of models) model.setRotationFromEuler(0, angle, 0);
  };
  input.on(Input.EventType.MOUSE_DOWN, () => {
    dragging = true;
  });
  input.on(Input.EventType.MOUSE_UP, () => {
    dragging = false;
  });
  input.on(Input.EventType.MOUSE_MOVE, (event: EventMouse) => {
    if (dragging) rotate(event.getDeltaX());
  });
  input.on(Input.EventType.TOUCH_MOVE, (event: EventTouch) => rotate(event.getDelta().x));
  input.on(Input.EventType.MOUSE_WHEEL, (event: EventMouse) => {
    camera.orthoHeight = Math.max(
      1.4,
      Math.min(4, camera.orthoHeight + event.getScrollY() * 0.002),
    );
  });
  const caption = document.createElement('div');
  caption.textContent = '原房屋 → 箱子重组仓库 → 公告牌重组商店 · 拖动旋转 / 滚轮缩放';
  Object.assign(caption.style, {
    position: 'fixed',
    bottom: '20px',
    width: '100%',
    textAlign: 'center',
    color: '#705037',
    font: '15px sans-serif',
    pointerEvents: 'none',
  });
  document.body.appendChild(caption);
}
