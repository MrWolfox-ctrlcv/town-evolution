import { assetManager, ImageAsset, Texture2D, SpriteFrame, Rect } from 'cc';
import { SharedResource } from '../application/SharedResource';
import { PRODUCT_ICON_REGIONS } from './ProductIconRegions';
/** Shared GPU resource only. Each icon consumer owns its own node bindings. */
class CropTexture {
  frame: SpriteFrame | null = null;
  private texture: Texture2D | null = null;
  private image: ImageAsset | null = null;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
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
      for (const listener of this.listeners) listener();
    };
    const bundle = assetManager.getBundle('resources');
    if (bundle) bundle.load(`crop-icons/${icon}`, ImageAsset, done);
    else assetManager.loadRemote<ImageAsset>(`crop-icons/${icon}.png`, { ext: '.png' }, done);
  }
  listen(listener: () => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    if (this.frame) listener();
    return () => this.listeners.delete(listener);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.frame?.destroy();
    this.texture?.destroy();
    this.image?.decRef();
    this.frame = null;
    this.texture = null;
    this.image = null;
  }
}
const textures = new Map<string, SharedResource<CropTexture>>();
export function acquireCropTexture(icon: string) {
  let shared = textures.get(icon);
  if (!shared) {
    shared = new SharedResource(() => new CropTexture(icon));
    textures.set(icon, shared);
  }
  return shared.acquire();
}
