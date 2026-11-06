import { Scene, Node, Camera, Color, Vec3, input, Input, EventMouse, EventTouch } from 'cc';
import { IslandView } from '../../assets/scripts/presentation/IslandView';
import { GroundObjects } from '../../assets/scripts/presentation/GroundObjects';
import { createGame } from '../../assets/scripts/domain/state';
import { AssetRenderer } from '../../assets/scripts/presentation/AssetRenderer';
import { configureTownLighting } from '../../assets/scripts/presentation/SceneLighting';

/** Real Cocos review only. Fresh throwaway state: no gameplay storage is read or written. */
export function terrainReview(scene: Scene): void {
  configureTownLighting(scene);
  const query = new URLSearchParams(window.location.search);
  const version = query.get('terrain-version') === '2' ? 2 : 3;
  const unit = query.get('terrain-unit') === '1';
  const seed = Math.max(1, Math.min(999999999, Number(query.get('seed')) || 42173));
  const root = new Node('TerrainReview');
  scene.addChild(root);
  const cameraNode = new Node('TerrainReviewCamera');
  scene.addChild(cameraNode);
  const camera = cameraNode.addComponent(Camera);
  camera.projection = Camera.ProjectionType.ORTHO;
  camera.orthoHeight = unit ? 2.5 : 9;
  camera.clearColor = new Color(196, 220, 221, 255);
  camera.near = 0.1;
  camera.far = 200;
  const target = new Vec3(unit ? 0 : 20, unit ? 0.7 : 1.2, unit ? 0 : 19);
  let angle = -Math.PI * 0.27;
  const pose = () => {
    cameraNode.setPosition(
      target.x + Math.sin(angle) * 24,
      target.y + 20,
      target.z + Math.cos(angle) * 24,
    );
    cameraNode.lookAt(target);
  };
  pose();
  if (unit) {
    const renderer = new AssetRenderer();
    for (let i = 0; i < 3; i++) {
      const model = renderer.create('natural-block-stone', `StoneUnit${i}`);
      model.setPosition((i - 1) * 1.45, 0, 0);
      model.setRotationFromEuler(0, i * 45, 0);
      root.addChild(model);
    }
  } else {
    const state = createGame(0, seed, version);
    const island = new IslandView(root, 40);
    island.sync(state);
    new GroundObjects(root).sync(state, island.naturalSurface);
  }
  let dragging = false;
  const rotate = (dx: number) => {
    angle += dx * 0.008;
    pose();
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
      Math.min(22, camera.orthoHeight + event.getScrollY() * 0.006),
    );
  });
  const caption = document.createElement('div');
  caption.textContent = `${unit ? '单块岩石' : `山体 · 地形版本 ${version} · 种子 ${seed}`} · 拖动旋转 / 滚轮缩放 · 不读写存档`;
  Object.assign(caption.style, {
    position: 'fixed',
    bottom: '20px',
    width: '100%',
    textAlign: 'center',
    color: '#364B40',
    font: '15px sans-serif',
    pointerEvents: 'none',
  });
  document.body.appendChild(caption);
}
