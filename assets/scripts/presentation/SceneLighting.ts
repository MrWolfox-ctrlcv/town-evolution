import { Camera, Color, DirectionalLight, Layers, Node, renderer, Scene, Vec3 } from 'cc';

/** One world-space sun for title and gameplay. Mesh occlusion, not a physics approximation. */
export function configureTownLighting(scene: Scene): void {
  if (scene.getChildByName('TownSun')) return;
  const globals = scene.globals;
  // Explicit LDR units avoid HDR exposure-dependent palette changes on the mobile pipeline.
  globals.skybox.useHDR = false;
  globals.ambient.skyLightingColor = new Color(220, 232, 240, 255);
  globals.ambient.groundLightingColor = new Color(164, 157, 137, 255);
  globals.ambient.skyIllum = 0.65;
  globals.shadows.type = renderer.scene.ShadowType.ShadowMap;
  globals.shadows.shadowMapSize = renderer.scene.ShadowSize.High_1024x1024;
  globals.shadows.maxReceived = 1;
  globals.shadows.enabled = true;

  const sunNode = new Node('TownSun');
  scene.addChild(sunNode);
  sunNode.setPosition(-30, 50, 25);
  sunNode.lookAt(new Vec3(0, 0, 0));
  const sun = sunNode.addComponent(DirectionalLight);
  sun.color = new Color(255, 246, 229, 255);
  sun.illuminance = 2.1;
  sun.visibility = Layers.Enum.DEFAULT | (1 << 18); // Isolated handbook model captures.
  sun.shadowEnabled = true;
  sun.shadowPcf = renderer.scene.PCFType.SOFT;
  sun.shadowBias = 0.0005;
  sun.shadowNormalBias = 0.02;
  sun.shadowSaturation = 1;
  // The engine fits one shadow map to each camera's visible region, so a 192-cell
  // island does not consume all shadow texels while the player inspects one house.
  // Keep off-screen tall casters in the culling range. No per-frame mesh generation.
  sun.shadowFixedArea = false;
  sun.csmLevel = 1;
  sun.shadowDistance = 100;
  sun.shadowInvisibleOcclusionRange = 32;
}

/** Fit the active world's shadow depth after zoom changes its orthographic camera pose. */
export function fitTownShadowDepth(camera: Camera, occlusionRange = 32): void {
  if (
    !camera.enabledInHierarchy ||
    !camera.node.activeInHierarchy ||
    !(camera.visibility & Layers.Enum.DEFAULT) ||
    !Number.isFinite(camera.far) ||
    camera.far <= camera.near
  )
    return;
  const sun = camera.node.scene?.getChildByName('TownSun')?.getComponent(DirectionalLight);
  // Hidden title and isolated handbook cameras must not overwrite the gameplay range.
  // No fixed upper bound: a narrow-screen overview may legitimately need > 500 units.
  if (sun && sun.shadowDistance !== camera.far) sun.shadowDistance = camera.far;
  if (sun) sun.shadowInvisibleOcclusionRange = occlusionRange;
}
