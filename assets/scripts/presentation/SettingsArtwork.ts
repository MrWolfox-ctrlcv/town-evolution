import {
  assetManager,
  ImageAsset,
  Texture2D,
  SpriteFrame,
  Sprite,
  Node,
  UITransform,
  Rect,
  Color,
  isValid,
} from 'cc';
import { uiNode } from './Widgets';
import type { Action, ButtonSurface } from './Widgets';
type Part = 'panel' | 'green' | 'paper' | 'red' | 'close';
// Exact regions of the ImageGen atlas, not hand-drawn substitutes. Native slices preserve corners.
const REGIONS: Record<Part, [number, number, number, number]> = {
  panel: [30, 20, 1450, 775],
  green: [25, 828, 425, 170],
  paper: [468, 828, 425, 170],
  red: [908, 828, 430, 170],
  close: [1350, 828, 164, 164],
};
export class SettingsArtwork implements ButtonSurface {
  private readonly frames = new Map<Part, SpriteFrame>();
  private readonly bindings = new Map<
    Node,
    { part: Part; width: number; height: number; enabled: boolean }
  >();
  private texture: Texture2D | null = null;
  private image: ImageAsset | null = null;
  private disposed = false;
  constructor() {
    const done = (error: Error | null, image?: ImageAsset) => {
      if (error || !image || this.disposed) return;
      this.image = image;
      image.addRef();
      const texture = (this.texture = new Texture2D());
      texture.image = image;
      for (const [part, region] of Object.entries(REGIONS) as [Part, (typeof REGIONS)[Part]][]) {
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.rect = new Rect(...region);
        const edge = part === 'panel' ? 205 : 65;
        frame.insetLeft = frame.insetRight = edge;
        frame.insetTop = frame.insetBottom = part === 'panel' ? 180 : 65;
        this.frames.set(part, frame);
      }
      for (const node of this.bindings.keys()) this.apply(node);
    };
    const bundle = assetManager.getBundle('resources');
    if (bundle) bundle.load('ui/settings', ImageAsset, done);
    else assetManager.loadRemote<ImageAsset>('ui/settings.png', { ext: '.png' }, done);
  }
  bind(node: Node, part: Part, width: number, height: number, enabled = true): void {
    this.bindings.set(node, { part, width, height, enabled });
    this.apply(node);
  }
  bindButton(node: Node, width: number, height: number, action: Action): void {
    const background = node.getChildByName('ImageSurface') ?? uiNode('ImageSurface', node);
    background.setSiblingIndex(0);
    const part =
      node.name === 'Menu-close'
        ? 'close'
        : action.caution
          ? 'red'
          : /返回游戏|确认|立即保存/.test(action.text)
            ? 'green'
            : 'paper';
    this.bind(background, part, width, height, action.enabled !== false);
    node.getComponent(UITransform)!.setContentSize(width, height);
  }
  private apply(node: Node): void {
    const binding = this.bindings.get(node);
    if (!binding || this.disposed || !isValid(node)) return;
    const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = binding.part === 'close' ? Sprite.Type.SIMPLE : Sprite.Type.SLICED;
    sprite.spriteFrame = this.frames.get(binding.part) ?? null;
    sprite.color = binding.enabled ? new Color(255, 255, 255, 255) : new Color(185, 185, 170, 245);
    // Slice borders stay at approximately 45–50 logical pixels rather than being stretched.
    const scale = binding.part === 'panel' ? 0.24 : 0.28;
    node.setScale(scale, scale, 1);
    node.getComponent(UITransform)!.setContentSize(binding.width / scale, binding.height / scale);
  }
  dispose(): void {
    this.disposed = true;
    this.bindings.clear();
    this.frames.forEach((frame) => frame.destroy());
    this.texture?.destroy();
    this.image?.decRef();
  }
}
