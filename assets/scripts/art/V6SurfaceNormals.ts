import { v6WorldNormal } from './V6SurfaceSamples';
import type { V3 } from './AssetTypes';
import type { V6SurfaceWorld } from './V6SurfaceContracts';
const CAPACITY = 8192;
type Entry = {
  method: V6SurfaceWorld['normal'];
  keys: Int32Array;
  values: Array<V3 | undefined>;
  other: Map<string, V3>;
};
const cache = new WeakMap<V6SurfaceWorld, Entry>();
const component = (n: number) => (Object.is(n, -0) ? '-0' : String(n));
/** Fixed-size direct-mapped quarter cache, avoiding LRU string/iterator churn.
 * Collisions only recompute exact values. Non-quarter coordinates retain exact keys. */
export function v6SurfaceNormal(world: V6SurfaceWorld, x: number, z: number, ground: boolean): V3 {
  let entry = cache.get(world);
  if (!entry || entry.method !== world.normal) {
    entry = {
      method: world.normal,
      keys: new Int32Array(CAPACITY).fill(-1),
      values: [],
      other: new Map(),
    };
    cache.set(world, entry);
  }
  const gx = x * 4,
    gz = z * 4;
  const quarter =
    Number.isInteger(gx) &&
    Number.isInteger(gz) &&
    gx >= 0 &&
    gz >= 0 &&
    gx <= world.size * 4 &&
    gz <= world.size * 4 &&
    !Object.is(x, -0) &&
    !Object.is(z, -0);
  const id = quarter ? (gz * (world.size * 4 + 1) + gx) * 2 + (ground ? 1 : 0) : -1;
  const slot = id % CAPACITY;
  const key = quarter ? '' : `${component(x)},${component(z)},${ground ? 1 : 0}`;
  const old = quarter
    ? entry.keys[slot] === id
      ? entry.values[slot]
      : undefined
    : entry.other.get(key);
  if (old) return old;
  const n = v6WorldNormal(world, x, z, ground);
  const value: V3 = Object.freeze([n[0], n[1], n[2]]);
  if (quarter) {
    entry.keys[slot] = id;
    entry.values[slot] = value;
  } else {
    if (entry.other.size >= 64) entry.other.clear();
    entry.other.set(key, value);
  }
  return value;
}
