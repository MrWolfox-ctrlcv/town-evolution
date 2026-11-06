import {
  Camera,
  Color,
  Director,
  director,
  Graphics,
  MeshRenderer,
  Node,
  Rect,
  RenderTexture,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
  isValid,
} from 'cc';
import { SharedResource } from '../application/SharedResource';
import { HANDBOOK_MODELS, handbookAsset } from '../art/HandbookAssets';
import { compileAsset } from '../art/MeshCompiler';
import {
  THUMBNAIL_COLUMNS,
  THUMBNAIL_EYE,
  THUMBNAIL_PIXELS,
  thumbnailFraming,
  thumbnailRegion,
} from '../art/ThumbnailFraming';
import { AssetRenderer } from './AssetRenderer';

/** Reserved UI capture layer. The world and HUD cameras never see these source meshes. */
export const MODEL_THUMBNAIL_LAYER = 1 << 18;

/** One real Cocos capture, shared frames, no continuous miniature scenes or GPU readbacks. */
class ModelThumbnails {
  private readonly frames = new Map<string, SpriteFrame>();
  private readonly bindings = new Map<Node, { kind: string; size: number }>();
  private texture: RenderTexture | null = null;
  private stage: Node | null = null;
  private renderer: AssetRenderer | null = null;
  private started = false;
  private disposed = false;
  private captureFrames = 0;

  bind(node: Node, kind: string, size: number): void {
    if (!HANDBOOK_MODELS[kind] || this.disposed) return;
    this.bindings.set(node, { kind, size });
    this.apply(node);
    if (!this.started) this.capture(node);
  }
  clear(node: Node): void {
    this.bindings.delete(node);
  }
  private capture(owner: Node): void {
    const scene = owner.scene;
    if (!scene) return;
    this.started = true;
    const kinds = Object.keys(HANDBOOK_MODELS);
    const rows = Math.ceil(kinds.length / THUMBNAIL_COLUMNS);
    this.texture = new RenderTexture();
    this.texture.reset({
      name: 'CanonicalModelThumbnails',
      width: THUMBNAIL_COLUMNS * THUMBNAIL_PIXELS,
      height: rows * THUMBNAIL_PIXELS,
    });
    this.stage = new Node('ModelThumbnailCapture');
    this.stage.active = false;
    scene.addChild(this.stage);
    this.renderer = new AssetRenderer();
    const layer = (node: Node) => {
      node.layer = MODEL_THUMBNAIL_LAYER;
      const mesh = node.getComponent(MeshRenderer);
      if (mesh) {
        mesh.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
        mesh.receiveShadow = MeshRenderer.ShadowReceivingMode.OFF;
      }
      node.children.forEach(layer);
    };
    kinds.forEach((kind, index) => {
      const source = handbookAsset(kind)!;
      const pose = thumbnailFraming(compileAsset(source), index, kinds.length);
      const node = this.renderer!.createRecipe(source, `ThumbnailSource-${source.id}`);
      node.setPosition(...pose.position);
      node.setScale(pose.scale, pose.scale, pose.scale);
      layer(node);
      this.stage!.addChild(node);
    });
    const cameraNode = new Node('ModelThumbnailCamera');
    this.stage.addChild(cameraNode);
    cameraNode.setPosition(...THUMBNAIL_EYE);
    cameraNode.lookAt(Vec3.ZERO);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = rows / 2;
    camera.near = 0.1;
    camera.far = 30;
    camera.priority = -10;
    camera.visibility = MODEL_THUMBNAIL_LAYER;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(0, 0, 0, 0);
    camera.targetTexture = this.texture;
    // Capture only after the actual shared wood material is ready (or its real fallback).
    void this.renderer.whenReady().then(() => {
      if (this.disposed || !this.stage || !isValid(this.stage)) return;
      this.stage.active = true;
      director.on(Director.EVENT_AFTER_DRAW, this.finishCapture, this);
    });
  }
  private finishCapture(): void {
    // One warm-up frame lets the scene register the new camera and mesh transforms.
    if (++this.captureFrames < 2) return;
    director.off(Director.EVENT_AFTER_DRAW, this.finishCapture, this);
    if (this.disposed || !this.texture) return;
    const kinds = Object.keys(HANDBOOK_MODELS);
    const signY = director.root?.device.capabilities.screenSpaceSignY ?? 1;
    kinds.forEach((kind, index) => {
      const frame = new SpriteFrame();
      frame.texture = this.texture!;
      const region = thumbnailRegion(index, kinds.length, signY);
      frame.name = `ModelThumbnail:${kind}`;
      frame.rect = new Rect(region.x, region.y, region.size, region.size);
      frame.flipUVY = region.flipY;
      frame.packable = false;
      this.frames.set(kind, frame);
    });
    this.releaseCapture();
    for (const node of this.bindings.keys()) this.apply(node);
  }
  private apply(node: Node): void {
    const binding = this.bindings.get(node);
    if (!binding || this.disposed || !isValid(node)) return;
    const frame = this.frames.get(binding.kind);
    if (!frame) return;
    const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    node.getComponent(UITransform)!.setContentSize(binding.size, binding.size);
    const fallback = node.getComponent(Graphics);
    if (fallback) fallback.enabled = false;
    node.getChildByName('ThumbnailLoading')?.destroy();
  }
  private releaseCapture(): void {
    if (this.stage) {
      this.stage.active = false;
      this.stage.removeFromParent();
      this.stage.destroy();
    }
    this.stage = null;
    this.renderer?.dispose();
    this.renderer = null;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    director.off(Director.EVENT_AFTER_DRAW, this.finishCapture, this);
    this.releaseCapture();
    this.bindings.clear();
    this.frames.forEach((frame) => frame.destroy());
    this.frames.clear();
    this.texture?.destroy();
    this.texture = null;
  }
}
const sharedThumbnails = new SharedResource(() => new ModelThumbnails());
export const acquireModelThumbnails = () => sharedThumbnails.acquire();
