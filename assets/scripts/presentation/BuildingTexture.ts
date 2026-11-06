import { SharedResource } from '../application/SharedResource';
import { assetManager, ImageAsset, Texture2D } from 'cc';
import { worldMaterial } from './WorldMaterial';
/** One image-generated albedo shared by every inherited timber component. */
export class BuildingTexture {
  readonly material = worldMaterial(true, true);
  private finishReady!: () => void;
  readonly ready = new Promise<void>((resolve) => (this.finishReady = resolve));
  private image: ImageAsset | null = null;
  private texture: Texture2D | null = null;
  private readonly fallback = new Texture2D();
  private disposed = false;
  constructor() {
    // The standard albedo-map variant is selected once, before any async upload.
    this.fallback.reset({ width: 1, height: 1, format: Texture2D.PixelFormat.RGBA8888 });
    this.fallback.uploadData(new Uint8Array([183, 126, 67, 255]));
    this.material.setProperty('mainTexture', this.fallback);
    const done = (error: Error | null, image?: ImageAsset) => {
      if (this.disposed || this.image) return;
      if (error || !image) {
        console.warn(
          'Building wood texture unavailable; using warm brown texture fallback.',
          error,
        );
        this.finishReady();
        return;
      }
      image.addRef();
      this.image = image;
      this.texture = new Texture2D();
      this.texture.image = image;
      this.material.setProperty('mainTexture', this.texture);
      this.finishReady();
    };
    const bundle = assetManager.getBundle('resources');
    if (bundle) bundle.load('buildings/warm-wood', ImageAsset, done);
    else assetManager.loadRemote<ImageAsset>('buildings/warm-wood.png', { ext: '.png' }, done);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.finishReady();
    this.material.destroy();
    this.texture?.destroy();
    this.fallback.destroy();
    this.image?.decRef();
  }
}

// One GPU upload is shared across the town, previews and UI factories that actually need wood.
const sharedWood = new SharedResource(() => new BuildingTexture());
export const acquireBuildingTexture = () => sharedWood.acquire();
