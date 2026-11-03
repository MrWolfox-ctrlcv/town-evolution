import { CROWN, TIMBER } from './OrganicShapes';
import type { AssetRecipe, MeshData, Part, V3 } from './AssetTypes';
const BOX: V3[] = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
];
const BOX_FACES = [
  [0, 3, 2, 1],
  [4, 5, 6, 7],
  [0, 4, 7, 3],
  [1, 2, 6, 5],
  [3, 7, 6, 2],
  [0, 1, 5, 4],
];
const GABLE: V3[] = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0, 0.5, 0.5],
];
const GEM: V3[] = [
  [0, 0.5, 0],
  [0.5, 0, 0],
  [0, 0, 0.5],
  [-0.5, 0, 0],
  [0, 0, -0.5],
  [0, -0.5, 0],
];
function transform(v: V3, p: Part): number[] {
  let [x, y, z] = v.map((n, i) => n * p.size[i]!) as [number, number, number];
  const [rx, ry, rz] = (p.rotation ?? [0, 0, 0]).map((n) => (n * Math.PI) / 180);
  [y, z] = [y * Math.cos(rx!) - z * Math.sin(rx!), y * Math.sin(rx!) + z * Math.cos(rx!)];
  [x, z] = [x * Math.cos(ry!) + z * Math.sin(ry!), -x * Math.sin(ry!) + z * Math.cos(ry!)];
  [x, y] = [x * Math.cos(rz!) - y * Math.sin(rz!), x * Math.sin(rz!) + y * Math.cos(rz!)];
  return [x + p.position[0], y + p.position[1], z + p.position[2]];
}
export function compileAsset(recipe: AssetRecipe): MeshData {
  const mesh: MeshData = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const p of recipe.parts) {
    const organic = p.shape === 'crown' ? CROWN : p.shape === 'timber' ? TIMBER : undefined;
    const vertices =
      organic?.vertices ?? (p.shape === 'box' ? BOX : p.shape === 'gable' ? GABLE : GEM);
    const faces =
      organic?.faces ??
      (p.shape === 'box'
        ? BOX_FACES
        : p.shape === 'gable'
          ? [
              [0, 2, 1],
              [3, 4, 5],
              [0, 3, 5, 2],
              [1, 2, 5, 4],
              [0, 1, 4, 3],
            ]
          : [
              [0, 2, 1],
              [0, 3, 2],
              [0, 4, 3],
              [0, 1, 4],
              [5, 1, 2],
              [5, 2, 3],
              [5, 3, 4],
              [5, 4, 1],
            ]);
    const points = vertices.map((v) => transform(v, p));
    const rgb = [1, 3, 5].map((i) => parseInt(p.color.slice(i, i + 2), 16) / 255);
    for (const face of faces) {
      const a = points[face[0]!]!,
        b = points[face[1]!]!,
        c = points[face[2]!]!;
      const u = b.map((n, i) => n - a[i]!),
        v = c.map((n, i) => n - a[i]!);
      const n = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      const length = Math.hypot(...n);
      if (length < 1e-10) throw new Error(`Degenerate ${recipe.id}/${p.name}`);
      const normal = n.map((k) => k / length);
      // Baked directional value keeps faceted shapes readable with the shared unlit material.
      const shade =
        0.6 + 0.4 * Math.max(0, normal[0]! * -0.45 + normal[1]! * 0.82 + normal[2]! * 0.36);
      const base = mesh.positions.length / 3;
      for (const index of face) {
        const pos = points[index]!;
        mesh.positions.push(...pos);
        mesh.normals.push(...normal);
        mesh.colors.push(...rgb.map((k) => k * shade), 1);
        pos.forEach((value, i) => {
          mesh.min[i] = Math.min(mesh.min[i]!, value);
          mesh.max[i] = Math.max(mesh.max[i]!, value);
        });
      }
      for (let j = 1; j < face.length - 1; j++) mesh.indices.push(base, base + j, base + j + 1);
    }
  }
  return mesh;
}
