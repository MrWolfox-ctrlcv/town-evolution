/** Seeded gradient noise in world coordinates. Static terrain never accepts a frame clock. */
export function perlin(x: number, z: number, seed: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz;
  const gradient = (a: number, b: number, dx: number, dz: number) => {
    let n = (seed ^ Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663)) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
    const angle = (((n ^ (n >>> 13)) >>> 0) / 4294967296) * Math.PI * 2;
    return Math.cos(angle) * dx + Math.sin(angle) * dz;
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const sx = fade(fx),
    sz = fade(fz);
  const a = gradient(ix, iz, fx, fz) * (1 - sx) + gradient(ix + 1, iz, fx - 1, fz) * sx;
  const b =
    gradient(ix, iz + 1, fx, fz - 1) * (1 - sx) + gradient(ix + 1, iz + 1, fx - 1, fz - 1) * sx;
  return a * (1 - sz) + b * sz;
}
export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
export const smooth01 = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
export const terrainNoise = (x: number, z: number, seed: number): number =>
  0.72 * perlin(x * 0.62, z * 0.62, seed) + 0.28 * perlin(x * 1.7, z * 1.7, seed + 73);
