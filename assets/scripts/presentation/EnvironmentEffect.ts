import { EffectAsset, resources } from 'cc';

/** Load project effects before any world materials are constructed in Creator.
 * The standalone preview registers the same sources before scene activation. */
export function prepareTownEnvironment(ready: () => void): () => void {
  const names = ['town-terrain', 'town-stylized-water', 'town-sky'];
  const missing = names.filter((name) => !EffectAsset.get(name));
  let live = true;
  let remaining = missing.length;
  if (!remaining) ready();
  for (const name of missing) {
    resources.load(`environment/${name}`, EffectAsset, (error, effect) => {
      if (!live) return;
      if (error || !effect) {
        console.warn(`Environment effect ${name} unavailable; keeping its safe fallback.`, error);
      } else if (!EffectAsset.get(name)) {
        EffectAsset.register(effect);
      }
      remaining--;
      if (!remaining) ready();
    });
  }
  return () => {
    live = false;
  };
}
