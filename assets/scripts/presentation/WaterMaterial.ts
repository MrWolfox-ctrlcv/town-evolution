import { Color, EffectAsset, Material } from 'cc';

export const WATER_EFFECT_NAME = 'town-stylized-water';

/** One opaque pass, no texture/depth/reflection-camera dependencies or vertex displacement. */
export function createWaterMaterial(): Material {
  const material = new Material();
  const effectAsset = EffectAsset.get(WATER_EFFECT_NAME);
  if (effectAsset) {
    material.initialize({ effectAsset });
  } else {
    // Loading failure must keep the original water visible and its occlusion intact.
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
    material.setProperty('mainColor', new Color(255, 255, 255, 255));
  }
  return material;
}
