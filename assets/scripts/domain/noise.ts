/** Reproducible lattice noise: no global random source, renderer or persisted cache. */
export function latticeNoise(x: number, z: number, seed: number): number {
  let n = (seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 3266489909) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const smooth = (n: number) => n * n * (3 - 2 * n);
  const tx = smooth(x - ix),
    tz = smooth(z - iz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(
    lerp(latticeNoise(ix, iz, seed), latticeNoise(ix + 1, iz, seed), tx),
    lerp(latticeNoise(ix, iz + 1, seed), latticeNoise(ix + 1, iz + 1, seed), tx),
    tz,
  );
}
export function fractalNoise(x: number, z: number, seed: number): number {
  return (
    (valueNoise(x, z, seed) * 4 +
      valueNoise(x * 2, z * 2, seed + 101) * 2 +
      valueNoise(x * 4, z * 4, seed + 307)) /
    7
  );
}
