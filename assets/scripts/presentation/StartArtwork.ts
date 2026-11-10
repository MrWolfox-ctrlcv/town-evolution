import { Camera, Layers, Node, Vec3 } from 'cc';
import { worldSize } from '../domain/world';
import { TITLE_ISLAND_TIME, titleIsland } from '../application/TitleIsland';
import { cameraDepth, fittedOrthoHeight } from '../application/CameraFraming';
import { TownView } from './TownView';
import { CropMotion } from './CropMotion';
import { color } from './Palette';
import { fitTownShadowDepth } from './SceneLighting';
/** Actual Cocos demo island, with the same terrain/buildings as gameplay. No image or saves. */
export class StartArtwork {
  readonly root: Node;
  private readonly town: TownView;
  private readonly camera: Camera;
  private readonly size: number;
  private readonly focus: Vec3;
  private elapsed = 0;
  private frame = 0;
  constructor(parent: Node) {
    this.root = new Node('TitleDemoIsland');
    parent.addChild(this.root);
    this.town = new TownView(this.root);
    const island = titleIsland();
    this.size = worldSize(island.terrainVersion);
    this.focus = new Vec3(this.size / 2, 0, this.size / 2);
    this.town.sync(island, null, null, TITLE_ISLAND_TIME);
    // Crop wind remains live, but no growth, production, shipment or save clock advances.
    for (const motion of this.root.getComponentsInChildren(CropMotion))
      motion.freezeGrowth(TITLE_ISLAND_TIME);
    const node = new Node('TitleIslandCamera');
    this.root.addChild(node);
    this.camera = node.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.priority = -1;
    // A failed sky effect load must still clear to the original background color.
    this.camera.clearFlags = parent.scene?.globals?.skybox.enabled
      ? Camera.ClearFlag.SKYBOX
      : Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = color('#77B8B6');
    this.camera.visibility = Layers.Enum.DEFAULT;
    this.camera.near = 0.1;
    this.camera.far = 150;
    this.layout(1, 1);
  }
  layout(width: number, height: number): void {
    // The real island fills the background; narrow phones retain the complete coastline.
    this.camera.orthoHeight = fittedOrthoHeight(width / Math.max(1, height), this.size);
    const depth = cameraDepth(this.size, this.camera.orthoHeight);
    this.camera.near = depth.near;
    this.camera.far = Math.max(150, depth.far);
    this.pose();
  }
  tick(dt: number): void {
    if (!this.root.activeInHierarchy || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += Math.min(dt, 0.1);
    this.frame += dt;
    if (this.frame < 1 / 30) return;
    this.frame = 0;
    this.pose();
  }
  private pose(): void {
    // A restrained living camera, not an input controller. No per-frame mesh work.
    const yaw = Math.sin(this.elapsed / 18) * 0.035;
    const depth = cameraDepth(this.size, this.camera.orthoHeight);
    this.camera.node.setPosition(
      this.focus.x + depth.x * Math.cos(yaw) + depth.z * Math.sin(yaw),
      depth.y,
      this.focus.z + depth.z * Math.cos(yaw) - depth.x * Math.sin(yaw),
    );
    this.camera.node.lookAt(this.focus);
    fitTownShadowDepth(this.camera);
  }
  dispose(): void {
    this.root.active = false;
    this.town.dispose();
    this.root.destroy();
  }
}
