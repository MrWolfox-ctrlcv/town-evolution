export type V5Point = readonly [number, number];
export const v5Clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
export function v5HydrologyHash(seed: number, x: number, z: number): number {
  let n = (seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
/** Scaled implicit ellipse, not an exact SDF. Its gradient norm is bounded by one. */
export function v5Ellipse(
  x: number,
  z: number,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  angle = 0,
): number {
  const c = Math.cos(angle),
    s = Math.sin(angle),
    dx = x - cx,
    dz = z - cz;
  return Math.min(rx, rz) * (1 - Math.hypot((c * dx + s * dz) / rx, (-s * dx + c * dz) / rz));
}
export function v5Capsule(x: number, z: number, a: V5Point, b: V5Point, radius = 2.9): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = v5Clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
  return radius - Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
export function v5SmoothMax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}
export function v5RiverPath(points: readonly V5Point[]): readonly V5Point[] {
  const out: V5Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!,
      p1 = points[i]!;
    const p2 = points[i + 1]!,
      p3 = points[Math.min(points.length - 1, i + 2)]!;
    const steps = Math.max(3, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.2));
    for (let j = 0; j < steps; j++) {
      const t = j / steps,
        t2 = t * t,
        t3 = t2 * t;
      const coordinate = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push(Object.freeze([coordinate(0), coordinate(1)]));
    }
  }
  out.push(Object.freeze([...points[points.length - 1]!] as [number, number]));
  if (out.length > 201) throw new Error('V5 river segment budget exceeded');
  return Object.freeze(out);
}
/** Omitted segments cannot exceed -24. This exactly evaluates max(-24, all capsules). */
export function v5RiverIndex(points: readonly V5Point[]) {
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!,
      b = points[i + 1]!,
      pad = 26.9;
    for (
      let x = Math.floor((Math.min(a[0], b[0]) - pad) / 16);
      x <= Math.floor((Math.max(a[0], b[0]) + pad) / 16);
      x++
    )
      for (
        let z = Math.floor((Math.min(a[1], b[1]) - pad) / 16);
        z <= Math.floor((Math.max(a[1], b[1]) + pad) / 16);
        z++
      ) {
        const key = `${x},${z}`,
          list = buckets.get(key) ?? [];
        list.push(i);
        buckets.set(key, list);
      }
  }
  return (x: number, z: number): number => {
    let value = -24;
    for (const i of buckets.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? [])
      value = Math.max(value, v5Capsule(x, z, points[i]!, points[i + 1]!));
    return value;
  };
}
