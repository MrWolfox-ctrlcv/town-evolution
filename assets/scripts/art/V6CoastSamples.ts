import { V6FifoCache } from '../domain/v6-fifo-cache';
import type { V3 } from './AssetTypes';
/** Source-owned, bounded sampling cache. Coast normals repeatedly query the same
 * seven quarter-grid neighbors; cache their exact height/color, not geometry or
 * editable state. Eviction only causes recomputation, never changes a value. */
export function cachedV6CoastSamples(field: {
  sample(x: number, z: number): { height: number; color: V3 };
}) {
  const values = new V6FifoCache<string, { height: number; color: V3 }>(4096);
  const component = (n: number) => (Object.is(n, -0) ? '-0' : String(n));
  return {
    sample(x: number, z: number): { height: number; color: V3 } {
      const key = `${component(x)},${component(z)}`,
        old = values.get(key);
      if (old) return old;
      const s = field.sample(x, z),
        value = { height: s.height, color: s.color };
      values.set(key, value);
      return value;
    },
  };
}
