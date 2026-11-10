import type { V3 } from './AssetTypes';

/** Closed flat-shaded chamfered timber. Only the new concept-led props use this shape. */
export function sawnWoodShape() {
  const vertices: V3[] = [],
    faces: number[][] = [];
  const corner = new Map<string, number>();
  const key = (axis: number, signs: number[]) => `${axis}:${signs.join(',')}`;
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3,
      v = (axis + 2) % 3;
    for (const side of [-1, 1]) {
      const face: number[] = [];
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const signs = [0, 0, 0];
        signs[axis] = side;
        signs[u] = a!;
        signs[v] = b!;
        const index = vertices.length;
        vertices.push(signs.map((s, i) => s * (i === axis ? 0.5 : 0.46)) as unknown as V3);
        corner.set(key(axis, signs), index);
        face.push(index);
      }
      faces.push(face);
    }
  }
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3,
      v = (axis + 2) % 3;
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        const signs = [-1, -1, -1];
        signs[u] = a;
        signs[v] = b;
        const lowU = corner.get(key(u, signs))!,
          lowV = corner.get(key(v, signs))!;
        signs[axis] = 1;
        faces.push([lowU, lowV, corner.get(key(v, signs))!, corner.get(key(u, signs))!]);
      }
  }
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        faces.push([0, 1, 2].map((axis) => corner.get(key(axis, [x, y, z]))!));
  // Orient all faces outwards, including the twelve bevels and eight corners.
  for (const face of faces) {
    const a = vertices[face[0]!]!,
      b = vertices[face[1]!]!,
      c = vertices[face[2]!]!;
    const u = b.map((n, i) => n - a[i]!),
      v = c.map((n, i) => n - a[i]!);
    const normal = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    if (normal.reduce((sum, n, i) => sum + n * a[i]!, 0) < 0) face.reverse();
  }
  return { vertices, faces, smooth: false };
}
