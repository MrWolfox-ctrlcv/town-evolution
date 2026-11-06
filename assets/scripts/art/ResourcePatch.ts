import type { MeshData, V3 } from './AssetTypes';
import { ContinuousField, TERRAIN_BASE } from './ContinuousField';
import type { CurvedResource } from './ContinuousField';
import { emptyNaturalMesh } from './NaturalMesh';
interface Vertex {
  point: V3;
  normal: V3;
}
function clip(vertices: Vertex[], level: number, below: boolean): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!,
      b = vertices[(i + 1) % vertices.length]!;
    const inside = (v: Vertex) => (below ? v.point[1] <= level : v.point[1] >= level);
    if (inside(a)) result.push(a);
    if (inside(a) === inside(b)) continue;
    const t = (level - a.point[1]) / (b.point[1] - a.point[1]);
    const mix = (x: V3, y: V3) => x.map((v, k) => v + (y[k]! - v) * t) as unknown as V3;
    const normal = mix(a.normal, b.normal),
      length = Math.hypot(...normal);
    result.push({
      point: mix(a.point, b.point),
      normal: normal.map((v) => v / length) as unknown as V3,
    });
  }
  return result;
}
/** Native surface triangles are clipped, with separate hard normals at every excavation plane. */
export function resourcePatch(field: ContinuousField, resource: CurvedResource): MeshData {
  const mesh = emptyNaturalMesh(),
    n = 4,
    { x, z } = resource;
  const cap = field.cutHeight(resource);
  const cutColor = resource.kind === 'stone' ? [0.52, 0.51, 0.48] : [0.58, 0.4, 0.23];
  function append({ point, normal }: Vertex, cut = false): void {
    mesh.positions.push(...point);
    mesh.normals.push(...normal);
    if (cut) {
      const tone = 0.97 + 0.025 * Math.sin(Math.floor(point[1]) * 2.1);
      mesh.colors.push(...cutColor.map((c) => c * tone), 1);
    } else mesh.colors.push(...field.color(resource, point[0], point[2], point[1], normal));
    point.forEach((value, axis) => {
      mesh.min[axis] = Math.min(mesh.min[axis]!, value);
      mesh.max[axis] = Math.max(mesh.max[axis]!, value);
    });
  }
  function polygon(vertices: Vertex[], cut = false): void {
    for (let i = 1; i < vertices.length - 1; i++) {
      const triangle = [vertices[0]!, vertices[i]!, vertices[i + 1]!];
      const [a, b, c] = triangle.map((v) => v.point) as [V3, V3, V3];
      const u = b.map((v, k) => v - a[k]!),
        v = c.map((q, k) => q - a[k]!);
      if (
        Math.hypot(
          u[1]! * v[2]! - u[2]! * v[1]!,
          u[2]! * v[0]! - u[0]! * v[2]!,
          u[0]! * v[1]! - u[1]! * v[0]!,
        ) < 1e-10
      )
        continue;
      const start = mesh.positions.length / 3;
      for (const vertex of triangle) append(vertex, cut);
      mesh.indices.push(start, start + 1, start + 2);
    }
  }
  const vertices: Vertex[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const xx = x + i / n,
        zz = z + j / n;
      vertices.push({ point: [xx, field.naturalHeight(xx, zz), zz], normal: field.normal(xx, zz) });
    }
  // The untouched majority shares 25 vertices per cell rather than 96 duplicated vertices.
  if (!Number.isFinite(cap)) for (const vertex of vertices) append(vertex);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i,
        b = (j + 1) * (n + 1) + i;
      for (const indices of [
        [a, b, b + 1],
        [a, b + 1, a + 1],
      ]) {
        const triangle = indices.map((k) => vertices[k]!);
        if (!triangle.some((v) => v.point[1] > TERRAIN_BASE + 1e-8)) continue;
        if (!Number.isFinite(cap)) mesh.indices.push(...indices);
        else {
          polygon(clip(triangle, cap, true));
          polygon(
            clip(triangle, cap, false).map((v) => ({
              point: [v.point[0], cap, v.point[2]],
              normal: [0, 1, 0],
            })),
            true,
          );
        }
      }
    }
  // Edge points run so bottom -> top -> next top has an outward winding.
  const edges = [
    { a: [0, 1], b: [0, 0], dx: -1, dz: 0, normal: [-1, 0, 0] },
    { a: [1, 0], b: [1, 1], dx: 1, dz: 0, normal: [1, 0, 0] },
    { a: [0, 0], b: [1, 0], dx: 0, dz: -1, normal: [0, 0, -1] },
    { a: [1, 1], b: [0, 1], dx: 0, dz: 1, normal: [0, 0, 1] },
  ];
  for (const edge of edges)
    for (let segment = 0; segment < n; segment++) {
      const point = (t: number): [number, number] => [
        x + edge.a[0]! + (edge.b[0]! - edge.a[0]!) * t,
        z + edge.a[1]! + (edge.b[1]! - edge.a[1]!) * t,
      ];
      const a = point(segment / n),
        b = point((segment + 1) / n);
      const topA = field.heightInCell(...a, x, z),
        topB = field.heightInCell(...b, x, z);
      const lowA = Math.min(topA, field.heightInCell(...a, x + edge.dx, z + edge.dz));
      const lowB = Math.min(topB, field.heightInCell(...b, x + edge.dx, z + edge.dz));
      if (topA <= lowA + 1e-8 && topB <= lowB + 1e-8) continue;
      const normal = edge.normal as unknown as V3;
      const face: Vertex[] = [
        { point: [a[0], lowA, a[1]], normal },
        { point: [a[0], topA, a[1]], normal },
        { point: [b[0], topB, b[1]], normal },
        { point: [b[0], lowB, b[1]], normal },
      ];
      for (
        let layer = Math.floor(Math.min(lowA, lowB) - TERRAIN_BASE);
        layer < Math.ceil(Math.max(topA, topB) - TERRAIN_BASE);
        layer++
      )
        polygon(
          clip(clip(face, layer + TERRAIN_BASE, false), layer + 1 + TERRAIN_BASE, true),
          true,
        );
    }
  return mesh;
}
