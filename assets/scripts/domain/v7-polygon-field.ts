import { perlin } from './v5-noise';
import { v5HydrologyHash } from './v5-hydrology-shapes';
export interface CoastPolygon {
  readonly points: readonly (readonly [number, number])[];
  readonly bounds: readonly [number, number, number, number];
  readonly insideDistance: (x: number, z: number) => number;
}
/** Fixed-angle positive radii define a simple star polygon, not an interpolated distance guess.
 * The result is the exact signed Euclidean distance to its closed segment boundary. */
export function createCoastPolygon(
  seed: number,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  angle: number,
  amplitude: number,
  count: number,
): CoastPolygon {
  if (
    !Number.isSafeInteger(seed) ||
    ![cx, cz, rx, rz, angle, amplitude].every(Number.isFinite) ||
    Math.max(Math.abs(cx), Math.abs(cz), rx, rz) > 1e6 ||
    Math.abs(angle) > Math.PI * 2 ||
    rx <= amplitude ||
    rz <= amplitude ||
    amplitude < 0 ||
    !Number.isInteger(count) ||
    count < 16 ||
    count > 128
  )
    throw Error('Invalid v7 coast polygon');
  const phaseX = v5HydrologyHash(seed, 59, 173) * 256,
    phaseZ = v5HydrologyHash(seed, 173, 59) * 256;
  const points = Object.freeze(
    Array.from({ length: count }, (_, i) => {
      const a = (i * Math.PI * 2) / count,
        c = Math.cos(a),
        s = Math.sin(a),
        d = a - angle;
      const base = 1 / Math.hypot(Math.cos(d) / rx, Math.sin(d) / rz);
      const n =
        (0.72 * perlin(phaseX + c * 1.65, phaseZ + s * 1.65, seed) +
          0.28 * perlin(phaseX + c * 4.4, phaseZ + s * 4.4, seed + 197)) /
        Math.SQRT2;
      const r = base + amplitude * n;
      return Object.freeze([cx + c * r, cz + s * r] as const);
    }),
  );
  const edges = points.map((p, i) => {
    const q = points[(i + 1) % count]!,
      dx = q[0] - p[0],
      dz = q[1] - p[1];
    if (
      ![...p, ...q, dx, dz].every(Number.isFinite) ||
      !(dx * dx + dz * dz > 0) ||
      !Number.isFinite(1 / (dx * dx + dz * dz))
    )
      throw Error('Invalid v7 polygon edge');
    return {
      x: p[0],
      z: p[1],
      dx,
      dz,
      inverse: 1 / (dx * dx + dz * dz),
      x0: Math.min(p[0], q[0]),
      x1: Math.max(p[0], q[0]),
      z0: Math.min(p[1], q[1]),
      z1: Math.max(p[1], q[1]),
    };
  });
  const bounds = Object.freeze([
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ] as const);
  function insideDistance(x: number, z: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1e6 || Math.abs(z) > 1e6)
      throw Error('Invalid polygon field coordinate');
    const a = (Math.atan2(z - cz, x - cx) + Math.PI * 2) % (Math.PI * 2);
    const index = Math.min(count - 1, Math.floor((a * count) / (Math.PI * 2))),
      selected = edges[index]!;
    const inside = selected.dx * (z - selected.z) - selected.dz * (x - selected.x) >= 0;
    let distance = Infinity;
    for (let j = 0; j < count; j++) {
      const e = edges[(index + j) % count]!,
        ax = Math.max(e.x0 - x, 0, x - e.x1),
        az = Math.max(e.z0 - z, 0, z - e.z1);
      if (ax * ax + az * az >= distance) continue;
      const t = Math.max(0, Math.min(1, ((x - e.x) * e.dx + (z - e.z) * e.dz) * e.inverse));
      const dx = x - e.x - t * e.dx,
        dz = z - e.z - t * e.dz;
      distance = Math.min(distance, dx * dx + dz * dz);
    }
    return (inside ? 1 : -1) * Math.sqrt(distance);
  }
  return Object.freeze({ points, bounds, insideDistance });
}
