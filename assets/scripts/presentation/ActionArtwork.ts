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
  Graphics,
} from 'cc';
import { drawSoilIcon } from './SoilIcon';
import { drawMudIcon } from './MudIcon';
import { drawTreeSeedIcon } from './TreeSeedIcon';
import { PRODUCT_ICON_REGIONS } from './ProductIconRegions';
const ATLAS = [
  'build',
  'manage',
  'orders',
  'tools',
  'buy',
  'sell',
  'save',
  'rotate',
  'upgrade',
  'ship',
  'seed',
  'close',
  'quantity',
  'return',
  'collect',
  'town',
];
/** One ImageGen atlas shared by all action buttons; crop/tool icons reuse existing artwork. */
export class ActionArtwork {
  private readonly frames = new Map<string, SpriteFrame>();
  private readonly textures: Texture2D[] = [];
  private readonly images: ImageAsset[] = [];
  private readonly requested = new Set<string>();
  private readonly bindings = new Map<Node, { kind: string; size: number; enabled: boolean }>();
  private disposed = false;
  constructor() {
    this.load('handbook/actions', ATLAS);
  }
  private load(path: string, keys: string[]): void {
    this.requested.add(keys[0]!);
    const done = (error: Error | null, image?: ImageAsset) => {
      if (error || !image || this.disposed) return;
      image.addRef();
      this.images.push(image);
      const texture = new Texture2D();
      texture.image = image;
      this.textures.push(texture);
      keys.forEach((key, index) => {
        const frame = new SpriteFrame();
        frame.texture = texture;
        if (keys.length > 1)
          frame.rect = new Rect(
            ((index % 4) * image.width) / 4,
            (Math.floor(index / 4) * image.height) / 4,
            image.width / 4,
            image.height / 4,
          );
        else {
          const region = PRODUCT_ICON_REGIONS[key];
          if (region) frame.rect = new Rect(...region);
        }
        this.frames.set(key, frame);
      });
      for (const node of this.bindings.keys()) this.apply(node);
    };
    const bundle = assetManager.getBundle('resources');
    if (bundle) bundle.load(path, ImageAsset, done);
    else assetManager.loadRemote<ImageAsset>(`${path}.png`, { ext: '.png' }, done);
  }
  bind(node: Node, kind: string, size: number, enabled: boolean): void {
    this.bindings.set(node, { kind, size, enabled });
    if (!ATLAS.includes(kind) && !this.requested.has(kind)) this.load(`crop-icons/${kind}`, [kind]);
    this.apply(node);
  }
  private apply(node: Node): void {
    const binding = this.bindings.get(node);
    if (!binding || this.disposed || !isValid(node)) return;
    const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
    const graphics = node.getComponent(Graphics);
    const frame = this.frames.get(binding.kind);
    const vector = !frame && ['soil', 'mud', 'tree-seed'].includes(binding.kind);
    sprite.enabled = !vector;
    if (graphics) graphics.enabled = vector;
    if (vector) {
      const draw =
        binding.kind === 'soil'
          ? drawSoilIcon
          : binding.kind === 'mud'
            ? drawMudIcon
            : drawTreeSeedIcon;
      draw(graphics ?? node.addComponent(Graphics), binding.size, binding.enabled);
      node.getComponent(UITransform)!.setContentSize(binding.size, binding.size);
      return;
    }
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame ?? null;
    sprite.color = binding.enabled ? new Color(255, 255, 255, 255) : new Color(155, 155, 155, 175);
    const region = PRODUCT_ICON_REGIONS[binding.kind];
    const scale = region ? binding.size / Math.max(region[2], region[3]) : 1;
    node
      .getComponent(UITransform)!
      .setContentSize(
        region ? region[2] * scale : binding.size,
        region ? region[3] * scale : binding.size,
      );
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bindings.clear();
    this.frames.forEach((frame) => frame.destroy());
    this.textures.forEach((texture) => texture.destroy());
    this.images.forEach((image) => image.decRef());
  }
}
export function actionIcon(text: string): string {
  if (/取消|关闭/.test(text) || text.trim() === '×') return 'close';
  if (/转向|重置|重新开始/.test(text)) return 'rotate';
  if (/取回|收回|返回/.test(text)) return 'return';
  if (/领取|拾取/.test(text)) return 'collect';
  if (/数量/.test(text)) return 'quantity';
  if (/^买|购买/.test(text)) return 'buy';
  if (/^卖|^出售/.test(text)) return 'sell';
  if (/装货|更多|材料/.test(text)) return 'quantity';
  if (/保存|备份/.test(text)) return 'save';
  if (/扩容/.test(text)) return 'upgrade';
  if (/小镇|演示岛/.test(text)) return 'town';
  for (const [label, icon] of [
    ['烤胡萝卜', 'roasted-carrot'],
    ['胡萝卜', 'carrot'],
    ['小麦', 'wheat'],
    ['生菜', 'lettuce'],
    ['水稻', 'rice'],
    ['稻谷', 'rice'],
    ['树苗', 'sapling'],
    ['肥料', 'fertilizer'],
    ['大米', 'milled-rice'],
    ['面粉', 'flour'],
    ['面包', 'bread'],
    ['木材', 'wood'],
    ['石材', 'stone'],
    ['石料', 'stone'],
    ['土壤', 'soil'],
    ['泥土', 'mud'],
    ['树种', 'tree-seed'],
    ['镰刀', 'sickle'],
    ['斧子', 'axe'],
    ['锤子', 'hammer'],
    ['锯子', 'saw'],
    ['挖掘工具', 'digging-tool'],
  ])
    if (text.includes(label!)) return icon!;
  if (/树|种苗|田地|农田/.test(text)) return 'seed';
  if (/船|运输/.test(text)) return 'ship';
  if (/订单/.test(text)) return 'orders';
  if (/商店/.test(text)) return 'buy';
  if (/工具/.test(text)) return 'tools';
  if (/建造/.test(text)) return 'build';
  return 'manage';
}
