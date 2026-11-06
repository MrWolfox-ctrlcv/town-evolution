import { v6WorldHeight, v6PreparedSamples } from './V6SurfaceSamples';
import type { V6SurfaceSource, V6SurfaceMesh } from './V6SurfaceContracts';
import { buildV6SurfaceMeshSteps } from './V6SurfaceMesh';
import { emptyV6SurfaceMesh } from './V6SurfaceMerge';
import { v6SurfaceNormal } from './V6SurfaceNormals';
import {
  v6FarCellMaterial,
  v6FarCellCandidate,
  v6FarNeighborOffsets,
  V6_FAR_DEFAULT_HEIGHT_ERROR,
  V6_FAR_MAX_HEIGHT_ERROR,
} from './V6FarSurfaceCell';
export {
  v6FarCellCandidate,
  V6_FAR_DEFAULT_HEIGHT_ERROR,
  V6_FAR_MAX_HEIGHT_ERROR,
  V6_FAR_MAX_NORMAL_ERROR,
} from './V6FarSurfaceCell';
export type V6FarDetailAt = (x: number, z: number) => boolean;
/** Display-only terrain. Exact fallbacks retain all geometry and attributes, but
 * neither partial yields nor the final mesh expose an interactable resource ID.
 * Callers rebuild both sides atomically when detailAt changes at a chunk seam. */
export function* buildV6FarSurfaceSteps(
  source: V6SurfaceSource,
  x0: number,
  z0: number,
  width = 1,
  depth = 1,
  detailAt: V6FarDetailAt = () => false,
  maxError = V6_FAR_DEFAULT_HEIGHT_ERROR,
): Generator<V6SurfaceMesh, V6SurfaceMesh> {
  if (!Number.isFinite(maxError) || maxError < 0 || maxError > V6_FAR_MAX_HEIGHT_ERROR)
    throw Error('Invalid far height error');
  const size = source.world.size;
  if (
    ![x0, z0, width, depth].every(Number.isInteger) ||
    width < 1 ||
    depth < 1 ||
    width > 32 ||
    depth > 32 ||
    x0 < 0 ||
    z0 < 0 ||
    x0 + width > size ||
    z0 + depth > size
  )
    throw Error('Invalid far mesh rectangle');
  const mesh = emptyV6SurfaceMesh();
  const detail = (x: number, z: number) =>
    x < 0 || z < 0 || x >= size || z >= size || detailAt(x, z);
  for (let z = z0; z < z0 + depth; z++)
    for (let x = x0; x < x0 + width; x++) {
      const cell = source.world.at(x, z);
      if (!cell || cell.reserved) continue;
      const material = detail(x, z) ? null : v6FarCellMaterial(source, x, z, maxError);
      if (!material) {
        const exact = buildV6SurfaceMeshSteps(source, x, z, 1, 1);
        const metadata = new Map<
          V6SurfaceMesh['triangles'][number],
          V6SurfaceMesh['triangles'][number]
        >();
        let sanitized = 0,
          copiedVertices = 0,
          copiedIndices = 0;
        const offset = mesh.positions.length / 3;
        for (;;) {
          const next = exact.next(),
            result = next.value;
          for (; sanitized < result.triangles.length; sanitized++) {
            const original = result.triangles[sanitized]!;
            let display = metadata.get(original);
            if (!display) {
              display = Object.freeze({ ...original, resourceId: null });
              metadata.set(original, display);
            }
            result.triangles[sanitized] = display;
          }
          // Runtime cells expose the real growing exact buffer to its byte gate.
          if (width === 1 && depth === 1) {
            if (next.done) return result;
            yield result;
          } else {
            appendPartial(mesh, result, offset, copiedVertices, copiedIndices);
            copiedVertices = result.positions.length / 3;
            copiedIndices = result.indices.length;
            if (!next.done) yield mesh;
          }
          if (next.done) break;
        }
      } else {
        const corners = [
          [x, z],
          [x, z + 1],
          [x + 1, z + 1],
          [x + 1, z],
        ];
        const boundary: number[] = [];
        const color = material === 'stone' ? [0.55, 0.54, 0.5, 1] : [0.5, 0.68, 0.29, 1];
        const ground = !source.world.resourceAt(x, z);
        const vertex = (px: number, pz: number) => {
          const index = mesh.positions.length / 3;
          const p = [
            Math.fround(px),
            Math.fround(
              v6PreparedSamples(source.world)
                ? v6WorldHeight(source.world, px, pz, ground)
                : source.heightInCell(px, pz, x, z),
            ),
            Math.fround(pz),
          ];
          mesh.positions.push(...p);
          mesh.normals.push(...v6SurfaceNormal(source.world, px, pz, ground));
          mesh.colors.push(...color);
          for (let a = 0; a < 3; a++) {
            mesh.min[a] = Math.min(mesh.min[a]!, p[a]!);
            mesh.max[a] = Math.max(mesh.max[a]!, p[a]!);
          }
          return index;
        };
        for (let side = 0; side < 4; side++) {
          const [dx, dz] = v6FarNeighborOffsets[side]!,
            nx = x + dx,
            nz = z + dz;
          const segments = !detail(nx, nz) && v6FarCellCandidate(source, nx, nz, maxError) ? 1 : 4;
          const a = corners[side]!,
            b = corners[(side + 1) % 4]!;
          for (let i = 0; i < segments; i++)
            boundary.push(
              vertex(
                a[0]! + ((b[0]! - a[0]!) * i) / segments,
                a[1]! + ((b[1]! - a[1]!) * i) / segments,
              ),
            );
        }
        const meta = Object.freeze({
          x,
          z,
          surface: 'natural' as const,
          material,
          resourceId: null,
        });
        const triangle = (a: number, b: number, c: number) => {
          mesh.indices.push(a, b, c);
          mesh.triangles.push(meta);
        };
        if (boundary.length === 4) {
          triangle(boundary[0]!, boundary[1]!, boundary[2]!);
          triangle(boundary[0]!, boundary[2]!, boundary[3]!);
        } else {
          const center = vertex(x + 0.5, z + 0.5);
          boundary.forEach((a, i) => triangle(center, a, boundary[(i + 1) % boundary.length]!));
        }
      }
      yield mesh;
    }
  if (!mesh.indices.length) mesh.min = mesh.max = [0, 0, 0];
  return mesh;
}

/** Rectangle/offline callers also see each partial buffer in allocation accounting. */
function appendPartial(
  target: V6SurfaceMesh,
  source: V6SurfaceMesh,
  offset: number,
  vertices: number,
  indices: number,
): void {
  for (let i = vertices * 3; i < source.positions.length; i++)
    target.positions.push(source.positions[i]!);
  for (let i = vertices * 3; i < source.normals.length; i++)
    target.normals.push(source.normals[i]!);
  for (let i = vertices * 4; i < source.colors.length; i++) target.colors.push(source.colors[i]!);
  for (let i = indices; i < source.indices.length; i++)
    target.indices.push(source.indices[i]! + offset);
  for (let i = indices / 3; i < source.triangles.length; i++)
    target.triangles.push(source.triangles[i]!);
  if (source.indices.length)
    for (let a = 0; a < 3; a++) {
      target.min[a] = Math.min(target.min[a]!, source.min[a]!);
      target.max[a] = Math.max(target.max[a]!, source.max[a]!);
    }
}
