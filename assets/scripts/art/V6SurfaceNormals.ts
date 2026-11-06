import type { V3 } from './AssetTypes';
import type { V6SurfaceWorld } from './V6SurfaceContracts';
const CAPACITY = 8192;
const cache = new WeakMap<
  V6SurfaceWorld,
  { method: V6SurfaceWorld['normal']; values: Map<string, V3> }
>();
const component = (n: number) => (Object.is(n, -0) ? '-0' : String(n));
/** Pure art-side memoization at the original (not rounded) coordinates. Bounded
 * independently of world size. Domain generation and its fingerprints are unchanged. */
export function v6SurfaceNormal(world: V6SurfaceWorld, x: number, z: number, ground: boolean): V3 {
  let entry = cache.get(world);
  if (!entry || entry.method !== world.normal) {
    entry = { method: world.normal, values: new Map() };
    cache.set(world, entry);
  }
  const key = `${component(x)},${component(z)},${ground ? 1 : 0}`;
  const old = entry.values.get(key);
  if (old) return old;
  const n = world.normal(x, z, ground);
  const value: V3 = Object.freeze([n[0], n[1], n[2]]);
  if (entry.values.size >= CAPACITY) entry.values.delete(entry.values.keys().next().value!);
  entry.values.set(key, value);
  return value;
}
