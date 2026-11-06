import type { V6SurfacePoint as P } from './V6SurfaceContracts';
/** Same linear polygon clipping contract as the frozen world6 writer, without exposing its mutable world. */
export function v6Clip(ps: P[], field: 'h' | 'g', level: number, below: boolean): P[] {
  const out: P[] = [];
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]!,
      b = ps[(i + 1) % ps.length]!,
      ia = below ? a[field] <= level : a[field] >= level,
      ib = below ? b[field] <= level : b[field] >= level;
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (level - a[field]) / (b[field] - a[field]);
      out.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        h: a.h + (b.h - a.h) * t,
        g: a.g + (b.g - a.g) * t,
      });
    }
  }
  return out;
}
