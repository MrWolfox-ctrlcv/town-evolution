import { director, Director, EffectAsset, Material, Node } from 'cc';
import type { Scene } from 'cc';

/** Loaded by EnvironmentEffect before the scene starts; no asynchronous material replacement. */
export const TOWN_SKY_EFFECT = 'town-sky';
const configured = new WeakMap<Scene, () => void>();

/**
 * Use the real engine skybox queue and cube, including its orthographic projection support.
 * This owns only the custom material, never the engine's shared default cube or sky mesh.
 * Lighting (HDR, IBL, exposure and ambient colors) deliberately remains the caller's choice.
 */
export function configureTownSky(scene: Scene): () => void {
  const existing = configured.get(scene);
  if (existing) return existing;
  const effect = EffectAsset.get(TOWN_SKY_EFFECT);
  if (!effect) return () => {};

  const skybox = scene.globals.skybox;
  const previousMaterial = skybox.skyboxMaterial;
  const previousEnabled = skybox.enabled;
  // A fresh Material is essential: Cocos does not rebuild an existing pass array on initialize.
  const material = new Material();
  material.initialize({ effectAsset: effect });
  const instances = new Set<Material>();
  let activated = false;
  let disposed = false;
  const rememberInstance = () => {
    if (director.getScene() !== scene) return;
    activated = true;
    const instance = director.root?.pipeline.pipelineSceneData.skybox.editableMaterial;
    if (instance?.parent === material) instances.add(instance);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    rememberInstance();
    director.off(Director.EVENT_AFTER_SCENE_LAUNCH, rememberInstance);
    scene.off(Node.EventType.NODE_DESTROYED, dispose);
    configured.delete(scene);
    // SkyboxInfo retains a reference to the global render resource after a scene switch.
    // Never let an old scene's destruction replace the newly active scene's material.
    if (skybox.skyboxMaterial === material && (!activated || director.getScene() === scene)) {
      skybox.enabled = false;
      skybox.skyboxMaterial = previousMaterial;
      skybox.enabled = previousEnabled;
    }
    // Skybox.setSkyboxMaterial creates an instance but does not destroy the displaced one.
    // These instances were created for this material only, not shared built-in resources.
    for (const instance of instances) instance.destroy();
    material.destroy();
  };

  skybox.skyboxMaterial = material;
  skybox.enabled = true;
  configured.set(scene, dispose);
  rememberInstance();
  director.on(Director.EVENT_AFTER_SCENE_LAUNCH, rememberInstance);
  scene.once(Node.EventType.NODE_DESTROYED, dispose);
  return dispose;
}
