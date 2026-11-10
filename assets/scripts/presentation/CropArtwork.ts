import { Sprite, Node, Graphics, UITransform, isValid } from 'cc';
import { uiNode } from './Widgets';
import { acquireCropTexture } from './CropTexture';
/** One shared texture per icon, with vector fallback until the image is ready. */
export class CropArtwork {
  private readonly texture: ReturnType<typeof acquireCropTexture>;
  private readonly stopListening: () => void;
  private disposed = false;
  private readonly bindings = new Map<Node, number>();
  constructor(icon: string) {
    this.texture = acquireCropTexture(icon);
    this.stopListening = this.texture.value.listen(() => {
      for (const [node, size] of this.bindings) this.apply(node, size);
    });
  }
  bind(node: Node, size = 40): void {
    if (this.disposed) return;
    this.bindings.set(node, size);
    if (this.texture.value.frame) this.apply(node, size);
  }
  clear(node: Node): void {
    this.bindings.delete(node);
    const child = node.getChildByName('CropImage');
    if (child) child.active = false;
    const fallback = node.getComponent(Graphics);
    if (fallback) fallback.enabled = true;
  }
  private apply(node: Node, size: number): void {
    const frame = this.texture.value.frame;
    if (this.disposed || !frame || !isValid(node)) return;
    const child = node.getChildByName('CropImage') ?? uiNode('CropImage', node);
    child.active = true;
    const sprite = child.getComponent(Sprite) ?? child.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    const width = frame.rect.width,
      height = frame.rect.height,
      scale = size / Math.max(width, height);
    child.getComponent(UITransform)!.setContentSize(width * scale, height * scale);
    const fallback = node.getComponent(Graphics);
    if (fallback) fallback.enabled = false;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bindings.clear();
    this.stopListening();
    this.texture.release();
  }
}
