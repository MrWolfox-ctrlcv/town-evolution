import type { AssetRecipe, MeshData, V3 } from './AssetTypes';
import { valueNoise } from '../domain/noise';
import { terrainHash, naturalQuad, emptyNaturalMesh } from './NaturalMesh';
import { appendRockUnit } from './RockBlockKit';
export { terrainHash, naturalQuad, emptyNaturalMesh } from './NaturalMesh';
export const naturalResourceHeight = (amount: number): number => 0.015 + amount;
export type NaturalMaterial = 'grass' | 'forest' | 'stone' | 'soil' | 'sand';
export type BlockFace = 'top' | 'bottom' | 'west' | 'east' | 'north' | 'south';
export const NATURAL_PALETTE: Record<NaturalMaterial, { top: string; side: string }> = {
  grass: { top: '#AACB62', side: '#AE8155' },
  forest: { top: '#779A48', side: '#927348' },
  stone: { top: '#AAA5AA', side: '#969099' },
  soil: { top: '#C68C55', side: '#AE734A' },
  sand: { top: '#F1D7A2', side: '#CFB584' },
};
const FACES: Record<BlockFace, V3[]> = {
  top: [
    [0, 1, 0],
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
  ],
  bottom: [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ],
  west: [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ],
  east: [
    [1, 0, 1],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ],
  north: [
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ],
  south: [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ],
};
const NORMALS: Record<BlockFace, V3> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  west: [-1, 0, 0],
  east: [1, 0, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
};
/**
 * A visible cube face is a shared 4×4 relief grid, not one bevelled rectangle.
 * Grid positions and cube boundaries stay fixed; only shallow, coherent normal
 * relief is allowed. Fine grain must never turn the unit into a crumpled surface.
 */
export function appendBlockFace(
  mesh: MeshData,
  origin: V3,
  face: BlockFace,
  material: NaturalMaterial,
  seed: number,
  sculpt = false,
  scale: V3 = [1, 1, 1],
): void {
  const points = FACES[face].map(
    (p) => p.map((value, i) => origin[i]! + value * scale[i]!) as unknown as V3,
  );
  const palette = NATURAL_PALETTE[material];
  if (!sculpt) {
    naturalQuad(
      mesh,
      points,
      face === 'top' ? palette.top : palette.side,
      0.96 + terrainHash(seed, origin[0] * 31, origin[1] * 31, origin[2] * 31) * 0.06,
    );
    return;
  }
  const n = NORMALS[face];
  const foundation = face === 'top' && origin[1] < 0;
  const divisions = 4,
    offset = mesh.positions.length / 3;
  const samples: V3[] = [];
  const normals = Array.from({ length: 25 }, () => [0, 0, 0]);
  const tones: number[] = [];
  const colors: string[] = [];
  for (let v = 0; v <= divisions; v++)
    for (let u = 0; u <= divisions; u++) {
      const s = u / divisions,
        t = v / divisions;
      const p = points[0]!.map(
        (value, axis) => value + (points[1]![axis]! - value) * s + (points[3]![axis]! - value) * t,
      );
      // Continuous seeded fields, not independent random offsets at every vertex.
      // All samples are spatial and static: no frame clock or animation is involved.
      const noise = valueNoise(p[0]! * 2.2 + p[1]! * 0.73, p[2]! * 2.2 - p[1]! * 0.61, seed + 163);
      const grain = valueNoise(p[0]! * 4.1 + p[1]! * 1.13, p[2]! * 4.1 - p[1]! * 0.97, seed + 379);
      const envelope = Math.sin(Math.PI * s) * Math.sin(Math.PI * t);
      const boundary = u === 0 || v === 0 || u === divisions || v === divisions;
      const depth = boundary
        ? 0
        : foundation
          ? -0.012 * noise * envelope
          : (noise - 0.5) * envelope * (material === 'stone' ? 0.035 : 0.022);
      // Never move vertices sideways: keep every logical block legible, rigid and crack-free.
      const sample = p.map((value, axis) => value + n[axis]! * depth) as unknown as V3;
      samples.push(sample);
      const unitTone =
        0.965 +
        terrainHash(
          seed,
          Math.floor(origin[0] * 2),
          Math.floor(origin[1] * 2),
          Math.floor(origin[2] * 2),
        ) *
          0.04;
      tones.push(unitTone + (grain - 0.5) * 0.026);
      // A coherent grass cap, not a random green/orange switch at neighbouring vertices.
      colors.push(
        face === 'top' && material === 'soil'
          ? '#A7BE68'
          : face === 'top'
            ? palette.top
            : palette.side,
      );
    }
  const indices: number[] = [];
  const triangle = (a: number, b: number, c: number) => {
    indices.push(a, b, c);
    const p = samples[a]!,
      q = samples[b]!,
      r = samples[c]!;
    const u = q.map((value, axis) => value - p[axis]!),
      v = r.map((value, axis) => value - p[axis]!);
    const normal = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    for (const vertex of [a, b, c])
      for (let axis = 0; axis < 3; axis++) normals[vertex]![axis]! += normal[axis]!;
  };
  for (let v = 0; v < divisions; v++)
    for (let u = 0; u < divisions; u++) {
      const a = v * 5 + u,
        b = a + 1,
        c = a + 6,
        d = a + 5;
      // Alternating diagonals avoid repeated diagonal bands across a mountain.
      if ((u + v) % 2) {
        triangle(a, b, d);
        triangle(b, c, d);
      } else {
        triangle(a, b, c);
        triangle(a, c, d);
      }
    }
  samples.forEach((point, i) => {
    const length = Math.hypot(...normals[i]!);
    const normal = normals[i]!.map((value) => value / length);
    mesh.positions.push(...point);
    mesh.normals.push(...normal);
    mesh.colors.push(
      ...[1, 3, 5].map((k) =>
        Math.min(1, (parseInt(colors[i]!.slice(k, k + 2), 16) / 255) * tones[i]!),
      ),
      1,
    );
    point.forEach((value, axis) => {
      mesh.min[axis] = Math.min(mesh.min[axis]!, value);
      mesh.max[axis] = Math.max(mesh.max[axis]!, value);
    });
  });
  mesh.indices.push(...indices.map((i) => offset + i));
}
/** Reusable source assets use the very same exposed-face compiler as the island. */
export function naturalBlock(material: NaturalMaterial, seed = 17): AssetRecipe {
  const mesh = emptyNaturalMesh();
  if (material === 'stone')
    appendRockUnit(mesh, [-0.5, 0, -0.5], seed, { top: true, bottom: true });
  else
    for (const face of Object.keys(FACES) as BlockFace[])
      appendBlockFace(mesh, [-0.5, 0, -0.5], face, material, seed, face !== 'bottom');
  return { id: `natural-block-${material}`, footprint: [1, 1], parts: [], mesh };
}
