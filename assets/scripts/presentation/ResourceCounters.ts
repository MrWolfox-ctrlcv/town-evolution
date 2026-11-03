import {
  Node,
  Label,
  LabelOutline,
  UITransform,
  assetManager,
  ImageAsset,
  Texture2D,
  SpriteFrame,
  Sprite,
  Rect,
  isValid,
} from 'cc';
import { uiNode, label } from './Widgets';
import { color } from './Palette';
import { getCapacity, getUsedStorage } from '../domain/game';
import type { GameState } from '../domain/game';

/** Floating resource icons: one shared atlas, no panel over the island. */
export class ResourceCounters {
  private readonly values: Label[] = [];
  private readonly icons: Node[] = [];
  private readonly frames: SpriteFrame[] = [];
  private image: ImageAsset | null = null;
  private texture: Texture2D | null = null;
  private disposed = false;
  constructor(private readonly parent: Node) {
    for (const name of ['Coins', 'Storage']) {
      const icon = uiNode(`Resource${name}`, parent);
      this.icons.push(icon);
      const value = label(parent, '', 18);
      value.enableWrapText = false;
      value.isBold = true;
      value.color = color('#FFF4DF');
      const outline = value.node.addComponent(LabelOutline);
      outline.color = color('#284540');
      outline.width = 2;
      this.values.push(value);
    }
    const done = (error: Error | null, image?: ImageAsset) => {
      if (error || !image || this.disposed) return;
      this.image = image;
      image.addRef();
      this.texture = new Texture2D();
      this.texture.image = image;
      const rects = [
        [40, 430, 525, 470],
        [640, 365, 590, 540],
      ];
      this.icons.forEach((node, i) => {
        if (!isValid(node)) return;
        const frame = new SpriteFrame();
        frame.texture = this.texture!;
        frame.rect = new Rect(...(rects[i] as [number, number, number, number]));
        this.frames.push(frame);
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = frame;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        node.getComponent(UITransform)!.setContentSize(42, 39);
      });
    };
    const bundle = assetManager.getBundle('resources');
    if (bundle) bundle.load('handbook/resources', ImageAsset, done);
    else assetManager.loadRemote<ImageAsset>('handbook/resources.png', { ext: '.png' }, done);
  }
  layout(width: number): void {
    const cell = width / 2;
    this.parent.getComponent(UITransform)!.setContentSize(width, 44);
    this.icons.forEach((icon, i) => {
      const left = -width / 2 + i * cell;
      icon.setPosition(left + 22, 0);
      const value = this.values[i]!;
      value.node.setPosition(left + 47 + (cell - 53) / 2, 0);
      value.node.getComponent(UITransform)!.setContentSize(cell - 53, 30);
    });
  }
  render(state: GameState): void {
    this.values[0]!.string = String(state.coins);
    this.values[1]!.string = `${getUsedStorage(state)}/${getCapacity(state)}`;
  }
  dispose(): void {
    this.disposed = true;
    this.frames.forEach((frame) => frame.destroy());
    this.texture?.destroy();
    this.image?.decRef();
  }
}
