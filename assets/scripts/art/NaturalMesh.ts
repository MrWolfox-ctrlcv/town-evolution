import type { MeshData, V3 } from './AssetTypes';
export function terrainHash(seed: number, x: number, y: number, z: number): number {
  let n =
    (seed ^
      Math.imul(x + 1, 73856093) ^
      Math.imul(y + 1, 83492791) ^
      Math.imul(z + 1, 19349663)) >>>
    0;
  n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
export function emptyNaturalMesh(): MeshData {
  return {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}
/** All winding is outward. Shared unit-cell corners never move or open cracks. */
export function naturalQuad(mesh: MeshData, points: readonly V3[], hex: string, tone = 1): void {
  const a = points[0]!,
    b = points[1]!,
    c = points[2]!;
  const u = b.map((n, i) => n - a[i]!),
    v = c.map((n, i) => n - a[i]!);
  const n = [
    u[1]! * v[2]! - u[2]! * v[1]!,
    u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!,
  ];
  const length = Math.hypot(...n);
  if (length < 1e-9) return;
  const normal = n.map((value) => value / length);
  // Store albedo, not a second, fixed sun baked into vertex colors.
  const color = [1, 3, 5].map((i) => Math.min(1, (parseInt(hex.slice(i, i + 2), 16) / 255) * tone));
  const offset = mesh.positions.length / 3;
  for (const point of points) {
    mesh.positions.push(...point);
    mesh.normals.push(...normal);
    mesh.colors.push(...color, 1);
    point.forEach((value, i) => {
      mesh.min[i] = Math.min(mesh.min[i]!, value);
      mesh.max[i] = Math.max(mesh.max[i]!, value);
    });
  }
  mesh.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}
