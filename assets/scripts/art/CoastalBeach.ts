import type { MeshData } from './AssetTypes';
import { coastVertex } from './CoastMesh';
import { perlin } from './ContinuousNoise';
import { protectedCoastPoint } from './CoastProtection';
import type { CoastPoint, CoastProtection } from './CoastProtection';

export function coastNormals(poly: readonly CoastPoint[], open = false): CoastPoint[] {
  const normals = poly.map((p, i) => {
    const a = open ? p : poly[(i + poly.length - 1) % poly.length]!,
      b = poly[(i + 1) % poly.length]!,
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz) || 1;
    return [-dz / length, dx / length] as CoastPoint;
  });
  if (open) normals[1] = normals[0]!;
  return normals;
}
// Explicit dry beach, darker wet sand, then a submerged sand shelf. The visible
// beach is nearly two tiles wide, rather than a beige stripe on a vertical wall.
const profile: readonly (readonly [number, number, readonly number[]])[] = [
  [0, 0, [0.53, 0.68, 0.31]],
  [0.09, 0.2, [0.66, 0.7, 0.4]],
  [0.22, 0.75, [0.9, 0.82, 0.6]],
  [0.43, 1.45, [0.88, 0.79, 0.57]],
  [0.59, 1.95, [0.73, 0.67, 0.49]],
  [0.74, 2.35, [0.62, 0.66, 0.52]],
  [1.1, 3.3, [0.43, 0.58, 0.54]],
];
export function appendCoastalBeach(
  mesh: MeshData,
  polygons: readonly (readonly CoastPoint[])[],
  seed: number,
  rects: readonly CoastProtection[],
  exactEdges: boolean,
  mask: ReadonlySet<string>,
): CoastPoint[][] {
  const waterlines: CoastPoint[][] = [];
  for (const poly of polygons) {
    const normals = coastNormals(poly, exactEdges);
    const area = poly.reduce((sum, p, i) => {
      const next = poly[(i + 1) % poly.length]!;
      return sum + p[0] * next[1] - next[0] * p[1];
    }, 0);
    const exactBank = exactEdges || area >= 0;
    let widths = poly.map((p, i) => {
      if (exactBank || protectedCoastPoint(p, rects)) return 0;
      const normal = normals[i]!;
      let width = 1 + 0.3 * perlin(p[0] * 0.12, p[1] * 0.12, seed + 31);
      // A narrow cove must not gain a sand bridge to the opposite bank. Read
      // only the captured mask, never invoke a second gameplay terrain query.
      let reachedWater = false;
      for (let d = 0.25; d <= 3.75; d += 0.25) {
        const x = Math.floor(p[0] + normal[0] * d),
          z = Math.floor(p[1] + normal[1] * d);
        if (!mask.has(`${x},${z}`)) reachedWater = true;
        else if (reachedWater) {
          width = Math.min(width, Math.max(0, d - 0.3) / 3.3);
          break;
        }
      }
      return width;
    });
    // Taper down toward a protected dock or tight cove rather than creating a
    // sudden two-tile sand spike at the edge of its protected footprint.
    if (!exactBank)
      for (let pass = 0; pass < 8; pass++)
        widths = widths.map((width, i) => {
          const left = (i + poly.length - 1) % poly.length,
            right = (i + 1) % poly.length;
          const limit = (neighbor: number) =>
            widths[neighbor]! +
            Math.hypot(poly[i]![0] - poly[neighbor]![0], poly[i]![1] - poly[neighbor]![1]) * 0.45;
          return Math.min(width, limit(left), limit(right));
        });
    const rows = profile.map(([depth, offset, color], row) => {
      const before = profile[Math.max(0, row - 1)]!,
        after = profile[Math.min(profile.length - 1, row + 1)]!;
      return poly.map((p, i) => {
        const normal = normals[i]!,
          width = widths[i]!,
          rise = after[0] - before[0],
          run = (after[1] - before[1]) * width,
          length = Math.hypot(rise, run) || 1;
        const variation = row === 0 ? 1 : 1 + 0.035 * perlin(p[0] * 0.7, p[1] * 0.7, seed + 67);
        return coastVertex(
          mesh,
          p[0] + normal[0] * offset * width,
          0.015 - depth,
          p[1] + normal[1] * offset * width,
          (normal[0] * rise) / length,
          run / length,
          (normal[1] * rise) / length,
          color.map((v) => v * variation),
        );
      });
    });
    for (let row = 0; row < rows.length - 1; row++)
      for (let i = 0; i < (exactEdges ? 1 : poly.length); i++) {
        const next = (i + 1) % poly.length,
          a = rows[row]![i]!,
          b = rows[row]![next]!,
          c = rows[row + 1]![next]!,
          d = rows[row + 1]![i]!;
        mesh.indices.push(a, d, c, a, c, b);
      }
    // Intersect the shelf with mean sea level y=-0.62. Water details follow the
    // actual wet shoreline, including zero-width protected dock approaches.
    waterlines.push(
      poly.map((p, i) => [
        p[0] + normals[i]![0] * 2.07 * widths[i]!,
        p[1] + normals[i]![1] * 2.07 * widths[i]!,
      ]),
    );
  }
  return waterlines;
}
