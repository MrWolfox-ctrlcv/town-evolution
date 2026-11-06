import type { V6Hydrology } from '../domain/v6-hydrology';
/** V6-only raw auto-side samples. Reuses immutable values without changing any
 * position, color or seven-point normal stencil in the legacy sampler. */
export function v6CoastSamples(field: V6Hydrology) {
  const values = new Map<string, ReturnType<V6Hydrology['sample']>>();
  return {
    sample(x: number, z: number) {
      const key = `${Object.is(x, -0) ? '-0' : x},${Object.is(z, -0) ? '-0' : z}`;
      const old = values.get(key);
      if (old) return old;
      const value = field.sample(x, z);
      if (values.size >= 8192) values.delete(values.keys().next().value!);
      values.set(key, value);
      return value;
    },
  };
}
