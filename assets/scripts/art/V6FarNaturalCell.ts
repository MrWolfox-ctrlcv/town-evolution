import { v6PreparedSamples, v6WorldHeight } from './V6SurfaceSamples';
import { v6SurfaceNormal } from './V6SurfaceNormals';
import { v6FarCellUntouched, v6FarNeighborOffsets } from './V6FarSurfaceCell';
import { v6ExactFlatCell } from './V6ExactFlatCell';
import { emptyV6SurfaceMesh } from './V6SurfaceMerge';
import type { V6SurfaceSource, V6SurfaceMesh } from './V6SurfaceContracts';
/** Exact display-only fallback for original prepared terrain. No clipping, walls,
 * changed resources or substituted samplers qualify. Retain the original quarter
 * triangles, Float32 heights, normals and per-triangle grass/stone boundary. */
export function buildV6FarNaturalCell(
  source: V6SurfaceSource,
  x: number,
  z: number,
): V6SurfaceMesh | null {
  const world = source.world;
  if (!v6PreparedSamples(world) || !v6FarCellUntouched(source, x, z)) return null;
  const cell = world.at(x, z),
    cap = source.capAt(x, z),
    ground = !world.resourceAt(x, z);
  if (!cell || cell.reserved || (ground ? cap !== -Infinity : cap !== Infinity)) return null;
  for (const [dx, dz] of v6FarNeighborOffsets) {
    const nx = x + dx,
      nz = z + dz,
      neighbor = world.at(nx, nz);
    if (
      neighbor &&
      !neighbor.reserved &&
      (!v6FarCellUntouched(source, nx, nz) || source.capAt(nx, nz) !== cap)
    )
      return null;
  }
  // Constant cells may use exact flat fans, whose topology must also be preserved.
  if (ground && v6ExactFlatCell(source, x, z)) return null;
  const mesh = emptyV6SurfaceMesh(),
    heights: number[] = [],
    exposed: boolean[] = [],
    stone = source.resourceAt(x, z)?.kind === 'stone',
    vertices = new Int32Array(50).fill(-1);
  const metadata = [false, true].map((isStone) =>
    Object.freeze({
      x,
      z,
      surface: 'natural' as const,
      material: isStone ? ('stone' as const) : ('grass' as const),
      resourceId: null,
    }),
  );
  for (let j = 0; j <= 4; j++)
    for (let i = 0; i <= 4; i++) {
      const px = x + i / 4,
        pz = z + j / 4,
        height = Math.fround(v6WorldHeight(world, px, pz, ground));
      heights.push(height);
      exposed.push(stone && height > Math.fround(v6WorldHeight(world, px, pz, true)));
    }
  const triangle = (a: number, b: number, c: number) => {
    const material = exposed[a] || exposed[b] || exposed[c] ? 1 : 0;
    for (const k of [a, b, c]) {
      const slot = k * 2 + material;
      let index = vertices[slot]!;
      if (index < 0) {
        index = mesh.positions.length / 3;
        vertices[slot] = index;
        const px = x + (k % 5) / 4,
          pz = z + Math.floor(k / 5) / 4,
          p = [Math.fround(px), heights[k]!, Math.fround(pz)];
        mesh.positions.push(...p);
        mesh.normals.push(...v6SurfaceNormal(world, px, pz, ground));
        mesh.colors.push(...(material ? [0.55, 0.54, 0.5, 1] : [0.5, 0.68, 0.29, 1]));
        for (let axis = 0; axis < 3; axis++) {
          mesh.min[axis] = Math.min(mesh.min[axis]!, p[axis]!);
          mesh.max[axis] = Math.max(mesh.max[axis]!, p[axis]!);
        }
      }
      mesh.indices.push(index);
    }
    mesh.triangles.push(metadata[material]!);
  };
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const k = j * 5 + i;
      triangle(k, k + 5, k + 6);
      triangle(k, k + 6, k + 1);
    }
  return mesh;
}
