import {
  assetManager,
  ImageAsset,
  Texture2D,
  SpriteFrame,
  Sprite,
  Node,
  Graphics,
  UITransform,
  isValid,
  Rect,
} from 'cc';
import { uiNode } from './Widgets';
import { PRODUCT_ICON_REGIONS } from './ProductIconRegions';
/** One shared texture per icon, with vector fallback until the image is ready. */
export class CropArtwork {
  private frame: SpriteFrame | null = null;
  private texture: Texture2D | null = null;
  private image: ImageAsset | null = null;
  private disposed = false;
  private readonly bindings = new Map<Node, number>();
  constructor(icon: string) {
    const done = (error: Error | null, image?: ImageAsset) => {
      if (error || !image || this.disposed) return;
      image.addRef();
      this.image = image;
      this.texture = new Texture2D();
      this.texture.image = image;
      this.frame = new SpriteFrame();
      this.frame.texture = this.texture;
      const region = PRODUCT_ICON_REGIONS[icon];
      if (region) this.frame.rect = new Rect(...region);
      for (const [node, size] of this.bindings) this.apply(node, size);
    };
    const bundle = assetManager.getBundle('resources');
    if (bundle) bundle.load(`crop-icons/${icon}`, ImageAsset, done);
    else assetManager.loadRemote<ImageAsset>(`crop-icons/${icon}.png`, { ext: '.png' }, done);
  }
  bind(node: Node, size = 40): void {
    this.bindings.set(node, size);
    if (this.frame) this.apply(node, size);
  }
  clear(node: Node): void {
    this.bindings.delete(node);
    const child = node.getChildByName('CropImage');
    if (child) child.active = false;
    const fallback = node.getComponent(Graphics);
    if (fallback) fallback.enabled = true;
  }
  private apply(node: Node, size: number): void {
    if (this.disposed || !this.frame || !isValid(node)) return;
    const child = node.getChildByName('CropImage') ?? uiNode('CropImage', node);
    child.active = true;
    const sprite = child.getComponent(Sprite) ?? child.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = this.frame;
    const width = this.frame.rect.width,
      height = this.frame.rect.height,
      scale = size / Math.max(width, height);
    child.getComponent(UITransform)!.setContentSize(width * scale, height * scale);
    const fallback = node.getComponent(Graphics);
    if (fallback) fallback.enabled = false;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bindings.clear();
    this.frame?.destroy();
    this.texture?.destroy();
    this.image?.decRef();
  }
}
