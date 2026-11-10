import { assetManager, Color, EffectAsset, ImageAsset, Material, Texture2D } from 'cc';
import { SharedResource } from '../application/SharedResource';
import type { ResourceLease } from '../application/SharedResource';
import { worldMaterial } from './WorldMaterial';

const surfaces = [
  ['grass', 'grassMap', [128, 173, 74, 255]],
  ['soil', 'soilMap', [166, 102, 54, 255]],
  ['rock', 'rockMap', [140, 138, 128, 255]],
  ['sand', 'sandMap', [224, 201, 145, 255]],
] as const;
type TextureListener = (property: string, texture: Texture2D) => void;

/** A single GPU upload per surface, shared even when multiple island views exist. */
class TerrainTextures {
  private readonly textures = new Map<string, Texture2D>();
  private readonly images: ImageAsset[] = [];
  private readonly listeners = new Set<TextureListener>();
  private finishReady!: () => void;
  readonly ready = new Promise<void>((resolve) => (this.finishReady = resolve));
  private remaining = surfaces.length;
  private disposed = false;

  constructor() {
    for (const [, property, color] of surfaces) {
      const texture = new Texture2D();
      texture.reset({ width: 1, height: 1, format: Texture2D.PixelFormat.RGBA8888 });
      texture.uploadData(new Uint8Array(color));
      this.textures.set(property, texture);
    }
    for (const [name, property] of surfaces) {
      let settled = false;
      const done = (error: Error | null, image?: ImageAsset) => {
        if (this.disposed || settled) return;
        settled = true;
        if (error || !image) {
          console.warn(`Terrain ${name} texture unavailable; retaining its color fallback.`, error);
        } else {
          image.addRef();
          this.images.push(image);
          const texture = new Texture2D();
          // Shader-side fract repeats the unchanged NPOT source on WebGL 1.
          texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
          texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
          // WebGL 1 cannot mipmap NPOT images. POT assets get Cocos mipmaps.
          const pot = (n: number) => n > 0 && (n & (n - 1)) === 0;
          texture.setMipFilter(
            pot(image.width) && pot(image.height) ? Texture2D.Filter.LINEAR : Texture2D.Filter.NONE,
          );
          texture.image = image;
          const fallback = this.textures.get(property)!;
          this.textures.set(property, texture);
          for (const listener of this.listeners) listener(property, texture);
          fallback.destroy();
        }
        if (--this.remaining === 0) this.finishReady();
      };
      const bundle = assetManager.getBundle('resources');
      if (bundle) bundle.load(`environment/${name}`, ImageAsset, done);
      else assetManager.loadRemote<ImageAsset>(`environment/${name}.png`, { ext: '.png' }, done);
    }
  }

  listen(listener: TextureListener): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    for (const [property, texture] of this.textures) listener(property, texture);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.finishReady();
    for (const texture of this.textures.values()) texture.destroy();
    this.textures.clear();
    for (const image of this.images) image.decRef();
    this.images.length = 0;
  }
}

const sharedTextures = new SharedResource(() => new TerrainTextures());

/** Island surfaces only. Buildings continue to use their existing materials. */
export class TerrainMaterial {
  readonly material: Material;
  readonly ready: Promise<void>;
  private readonly effect: EffectAsset | null;
  private textures: ResourceLease<TerrainTextures> | null = null;
  private stopTextures: () => void = () => {};
  private finishReady: () => void = () => {};
  private disposed = false;

  constructor() {
    this.effect = EffectAsset.get('town-terrain') ?? null;
    if (!this.effect) {
      this.material = worldMaterial();
      this.ready = Promise.resolve();
      return;
    }
    this.effect.addRef();
    this.material = new Material();
    this.material.initialize({
      effectAsset: this.effect,
      defines: { USE_VERTEX_COLOR: true, USE_ALBEDO_MAP: false },
    });
    this.material.setProperty('mainColor', new Color(255, 255, 255, 255));
    this.material.setProperty('roughness', 0.93);
    this.material.setProperty('metallic', 0);
    this.material.setProperty('specularIntensity', 0.1);
    this.textures = sharedTextures.acquire();
    this.stopTextures = this.textures.value.listen((property, texture) => {
      if (!this.disposed) this.material.setProperty(property, texture);
    });
    this.ready = new Promise<void>((resolve) => (this.finishReady = resolve));
    void this.textures.value.ready.then(() => this.finishReady());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopTextures();
    this.finishReady();
    this.material.destroy();
    this.textures?.release();
    this.textures = null;
    this.effect?.decRef();
  }
}
