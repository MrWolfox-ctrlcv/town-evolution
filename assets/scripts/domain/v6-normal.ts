/** Shared deterministic normal from the authoritative triangle surface, not from live stock. */
export function v6SurfaceNormal(
  field: {
    groundHeight(x: number, z: number): number;
    naturalHeight(x: number, z: number): number;
  },
  x: number,
  z: number,
  ground = false,
): readonly [number, number, number] {
  const e = 0.125,
    h = (a: number, b: number) => (ground ? field.groundHeight(a, b) : field.naturalHeight(a, b)),
    dx = (h(x - e, z) - h(x + e, z)) / (2 * e),
    dz = (h(x, z - e) - h(x, z + e)) / (2 * e),
    d = Math.hypot(dx, 1, dz);
  return [dx / d, 1 / d, dz / d];
}
