import { Color, Material, MeshRenderer } from 'cc';

/** Shared matte albedo. Lighting and occlusion come from the renderer, never painted discs. */
export type WorldMaterialScope = 'standalone' | 'repeated-assets';
export function worldMaterial(
  vertexColors = true,
  textured = false,
  scope: WorldMaterialScope = 'standalone',
): Material {
  const material = new Material();
  material.initialize({
    effectName: 'builtin-standard',
    defines: {
      USE_VERTEX_COLOR: vertexColors,
      USE_ALBEDO_MAP: textured,
      USE_INSTANCING: scope === 'repeated-assets',
    },
  });
  material.setProperty('mainColor', new Color(255, 255, 255, 255));
  material.setProperty('roughness', 0.9);
  material.setProperty('metallic', 0);
  material.setProperty('specularIntensity', 0.12);
  return material;
}

export function worldShadows(renderer: MeshRenderer, casts = true): void {
  renderer.shadowCastingMode = casts
    ? MeshRenderer.ShadowCastingMode.ON
    : MeshRenderer.ShadowCastingMode.OFF;
  renderer.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
}
