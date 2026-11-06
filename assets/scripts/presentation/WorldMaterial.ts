import { Color, Material, MeshRenderer } from 'cc';

/** Shared matte albedo. Lighting and occlusion come from the renderer, never painted discs. */
export function worldMaterial(vertexColors = true, textured = false): Material {
  const material = new Material();
  material.initialize({
    effectName: 'builtin-standard',
    defines: { USE_VERTEX_COLOR: vertexColors, USE_ALBEDO_MAP: textured },
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
