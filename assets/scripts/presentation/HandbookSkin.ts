import {
  assetManager,
  ImageAsset,
  Texture2D,
  SpriteFrame,
  Sprite,
  Node,
  UITransform,
  Rect,
  isValid,
  Graphics,
  Label,
} from 'cc';
import { uiNode } from './Widgets';
export type Navigation = 'back' | 'close' | 'previous' | 'next';
type Surface = 'cover' | 'paper' | 'directory' | 'tab' | Navigation;
/** One atlas texture shared by the three small handbook surfaces. */
export class HandbookSkin {
  private image: ImageAsset | null = null;
  private texture: Texture2D | null = null;
  private readonly frames = new Map<Surface, SpriteFrame>();
  private readonly bindings: Array<{ node: Node; kind: Surface; width: number; height: number }> =
    [];
  private disposed = false;
  constructor(private readonly navigation = false) {
    const done = (error: Error | null, image?: ImageAsset) => {
      if (error || !image) return;
      image.addRef();
      if (this.disposed) {
        image.decRef();
        return;
      }
      this.image = image;
      this.texture = new Texture2D();
      this.texture.image = image;
      const cells: Array<[Surface, number, number, number, number]> = navigation
        ? [
            ['back', 45, 45, 570, 570],
            ['close', 625, 45, 570, 570],
            ['previous', 45, 625, 570, 570],
            ['next', 625, 625, 570, 570],
          ]
        : [
            ['cover', 105, 30, 440, 540],
            ['paper', 700, 35, 470, 535],
            ['directory', 62, 620, 500, 590],
            ['tab', 636, 798, 580, 240],
          ];
      for (const [kind, x, y, width, height] of cells) {
        const frame = new SpriteFrame();
        frame.texture = this.texture;
        frame.rect = new Rect(x, y, width, height);
        this.frames.set(kind, frame);
      }
      this.bindings.forEach((binding) => this.apply(binding));
    };
    const bundle = assetManager.getBundle('resources');
    const path = navigation ? 'handbook/navigation' : 'handbook/atlas';
    if (bundle) bundle.load(path, ImageAsset, done);
    else assetManager.loadRemote<ImageAsset>(`${path}.png`, { ext: '.png' }, done);
  }
  bind(node: Node, kind: Surface, width: number, height: number): void {
    const binding = { node, kind, width, height };
    this.bindings.push(binding);
    this.apply(binding);
  }
  private apply(binding: { node: Node; kind: Surface; width: number; height: number }): void {
    const frame = this.frames.get(binding.kind);
    if (this.disposed || !frame || !isValid(binding.node)) return;
    const child =
      binding.node.getChildByName('HandbookSkin') ?? uiNode('HandbookSkin', binding.node);
    child.setSiblingIndex(0);
    const fallback = binding.node.getComponent(Graphics);
    if (fallback) fallback.enabled = false;
    if (this.navigation)
      binding.node.children.forEach((node) => {
        const text = node.getComponent(Label);
        if (text) text.enabled = false;
      });
    const lining = binding.node.getChildByName('FolderLining');
    if (lining) lining.active = false;
    const sprite = child.getComponent(Sprite) ?? child.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    child.getComponent(UITransform)!.setContentSize(binding.width, binding.height);
  }
  dispose(): void {
    this.disposed = true;
    this.bindings.length = 0;
    this.frames.forEach((frame) => frame.destroy());
    this.frames.clear();
    this.texture?.destroy();
    this.image?.decRef();
  }
}
