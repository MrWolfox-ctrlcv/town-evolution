import { BLADE } from './CropGeometry';
import { PLANT_SHAPES } from './PlantShapes';
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
  if (recipe.mesh)
    return {
      ...recipe.mesh,
      positions: [...recipe.mesh.positions],
      normals: [...recipe.mesh.normals],
      colors: [...recipe.mesh.colors],
      indices: [...recipe.mesh.indices],
      min: [...recipe.mesh.min],
      max: [...recipe.mesh.max],
    };
  const mesh: MeshData = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    uvs: [],
    texturedIndices: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const p of recipe.parts) {
    const organic =
      PLANT_SHAPES[p.shape] ??
      (p.shape === 'crown'
        ? CROWN
        : p.shape === 'timber'
          ? TIMBER
          : p.shape === 'blade'
            ? BLADE
            : undefined);
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
    const smooth = PLANT_SHAPES[p.shape]?.smooth;
    const normals = points.map(() => [0, 0, 0]);
    if (smooth)
      for (const face of faces) {
        const a = points[face[0]!]!,
          b = points[face[1]!]!,
          c = points[face[2]!]!;
        const u = b.map((v, i) => v - a[i]!),
          v = c.map((v, i) => v - a[i]!);
        const n = [
          u[1]! * v[2]! - u[2]! * v[1]!,
          u[2]! * v[0]! - u[0]! * v[2]!,
          u[0]! * v[1]! - u[1]! * v[0]!,
        ];
        for (const index of face) n.forEach((v, i) => (normals[index]![i]! += v));
      }
    const rgb = [1, 3, 5].map((i) => parseInt(p.color.slice(i, i + 2), 16) / 255);
    if (smooth) {
      const base = mesh.positions.length / 3;
      points.forEach((pos, index) => {
        const n = normals[index]!.map((v) => v / Math.hypot(...normals[index]!));
        mesh.positions.push(...pos);
        mesh.normals.push(...n);
        mesh.uvs!.push(0, 0);
        mesh.colors.push(...rgb, 1);
        pos.forEach((v, i) => {
          mesh.min[i] = Math.min(mesh.min[i]!, v);
          mesh.max[i] = Math.max(mesh.max[i]!, v);
        });
      });
      for (const face of faces)
        for (let i = 1; i < face.length - 1; i++)
          mesh.indices.push(base + face[0]!, base + face[i]!, base + face[i + 1]!);
      continue;
    }
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
      // Pure albedo lets geometry rotate under the actual world-space sun.
      const base = mesh.positions.length / 3;
      for (const index of face) {
        const pos = points[index]!;
        const vertexNormal = smooth
          ? normals[index]!.map((v) => v / Math.hypot(...normals[index]!))
          : normal;
        mesh.positions.push(...pos);
        mesh.normals.push(...vertexNormal);
        // Project local face coordinates; the longest face axis follows the wood grain.
        const local = vertices[index]!;
        const faceLocal = face.map((i) => vertices[i]!);
        const span = [0, 1, 2].map(
          (a) =>
            Math.max(...faceLocal.map((v) => v[a]!)) - Math.min(...faceLocal.map((v) => v[a]!)),
        );
        const axes = [0, 1, 2]
          .filter((a) => span[a]! > 0.001)
          .sort((a, b) => p.size[b]! - p.size[a]!);
        const u = axes[0] ?? 0,
          v = axes[1] ?? 1;
        const grainWidth = Math.min(0.8, p.size[v]! / p.size[u]!);
        const patch =
          Math.abs(p.position[0] * 0.37 + p.position[1] * 0.29 + p.position[2] * 0.43) % 0.19;
        mesh.uvs!.push((local[u]! + 0.5) * 0.8 + patch, (local[v]! + 0.5) * grainWidth + patch);
        mesh.colors.push(...rgb, 1);
        pos.forEach((value, i) => {
          mesh.min[i] = Math.min(mesh.min[i]!, value);
          mesh.max[i] = Math.max(mesh.max[i]!, value);
        });
      }
      for (let j = 1; j < face.length - 1; j++) {
        mesh.indices.push(base, base + j, base + j + 1);
        if (p.texture) mesh.texturedIndices!.push(base, base + j, base + j + 1);
      }
    }
  }
  return mesh;
}
