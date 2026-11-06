import type { MeshData } from './AssetTypes';
import { emptyNaturalMesh } from './NaturalMesh';
import { coastVertex } from './CoastMesh';
import { appendCoastalBeach } from './CoastalBeach';
export { coastVertex } from './CoastMesh';
import { perlin } from './ContinuousNoise';
import { protectedCoastPoint as protectedPoint } from './CoastProtection';
import type { CoastPoint, CoastProtection, CoastProtectionSnapshot } from './CoastProtection';
export { coastProtectionSignature } from './CoastProtection';
export type { CoastPoint, CoastProtection, CoastProtectionSnapshot } from './CoastProtection';
export interface ContinuousCoast extends CoastProtectionSnapshot {
  mesh: MeshData;
  waterlines: CoastPoint[][];
}
const cross = (a: CoastPoint, b: CoastPoint, c: CoastPoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const key = (p: CoastPoint) => `${p[0]},${p[1]}`;
function triangulate(poly: readonly CoastPoint[]): number[] | null {
  const active = poly.map((_, i) => i),
    out: number[] = [];
  while (active.length > 3) {
    let found = false;
    for (let j = 0; j < active.length; j++) {
      const a = active[(j + active.length - 1) % active.length]!,
        b = active[j]!,
        c = active[(j + 1) % active.length]!;
      const pa = poly[a]!,
        pb = poly[b]!,
        pc = poly[c]!,
        v = cross(pa, pb, pc);
      if (Math.abs(v) < 1e-10) {
        active.splice(j, 1);
        found = true;
        break;
      }
      if (v >= 0) continue;
      if (
        active.some(
          (i) =>
            i !== a &&
            i !== b &&
            i !== c &&
            // A vertex on the proposed diagonal also blocks this ear. Ignoring
            // boundary vertices cuts across concave protected shoreline steps.
            cross(pa, pb, poly[i]!) <= 1e-9 &&
            cross(pb, pc, poly[i]!) <= 1e-9 &&
            cross(pc, pa, poly[i]!) <= 1e-9,
        )
      )
        continue;
      out.push(a, b, c);
      active.splice(j, 1);
      found = true;
      break;
    }
    if (!found) return null;
  }
  if (active.length === 3) out.push(...active);
  return out;
}
function simple(poly: readonly CoastPoint[]): boolean {
  for (let i = 0; i < poly.length; i++)
    for (let j = i + 2; j < poly.length; j++) {
      if (i === 0 && j === poly.length - 1) continue;
      const a = poly[i]!,
        b = poly[(i + 1) % poly.length]!,
        c = poly[j]!,
        d = poly[(j + 1) % poly.length]!;
      if (cross(a, b, c) * cross(a, b, d) < -1e-12 && cross(c, d, a) * cross(c, d, b) < -1e-12)
        return false;
    }
  return true;
}
function smooth(
  raw: readonly CoastPoint[],
  seed: number,
  rects: readonly CoastProtection[],
  samples: number,
): CoastPoint[] {
  const n = raw.length,
    locks = raw.map(
      (p, i) =>
        protectedPoint(p, rects) ||
        protectedPoint(raw[(i + n - 1) % n]!, rects) ||
        protectedPoint(raw[(i + 1) % n]!, rects),
    );
  let p = raw.map((a) => [...a] as CoastPoint);
  for (let pass = 0; pass < 3; pass++)
    p = p.map((v, i) => {
      if (locks[i]) return v;
      const a = p[(i + n - 1) % n]!,
        b = p[(i + 1) % n]!,
        w = 0.24 + 0.04 * perlin(raw[i]![0] * 0.17, raw[i]![1] * 0.17, seed);
      return [v[0] * (1 - 2 * w) + (a[0] + b[0]) * w, v[1] * (1 - 2 * w) + (a[1] + b[1]) * w];
    });
  const curve: CoastPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n]!,
      b = p[i]!,
      c = p[(i + 1) % n]!,
      d = p[(i + 2) % n]!;
    for (let k = 0; k < samples; k++) {
      const t = k / samples;
      curve.push(
        [0, 1].map((axis) =>
          locks[i] || locks[(i + 1) % n]
            ? b[axis]! * (1 - t) + c[axis]! * t
            : 0.5 *
              (2 * b[axis]! +
                (-a[axis]! + c[axis]!) * t +
                (2 * a[axis]! - 5 * b[axis]! + 4 * c[axis]! - d[axis]!) * t * t +
                (-a[axis]! + 3 * b[axis]! - 3 * c[axis]! + d[axis]!) * t * t * t),
        ) as unknown as CoastPoint,
      );
    }
  }
  return curve;
}
/** Mask is read once. Complex topology uses exact cell tops and zero-offset walls. */
export function buildContinuousCoast(
  size: number,
  seed: number,
  isLand: (x: number, z: number) => boolean,
  protectedRects: readonly CoastProtection[] = [],
): ContinuousCoast {
  const cells: CoastPoint[] = [],
    mask = new Set<string>();
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++)
      if (isLand(x, z)) {
        cells.push([x, z]);
        mask.add(`${x},${z}`);
      }
  const edges: Array<readonly [CoastPoint, CoastPoint]> = [];
  for (const [x, z] of cells) {
    const sides: Array<readonly [number, number, CoastPoint, CoastPoint]> = [
      [x - 1, z, [x, z], [x, z + 1]],
      [x, z + 1, [x, z + 1], [x + 1, z + 1]],
      [x + 1, z, [x + 1, z + 1], [x + 1, z]],
      [x, z - 1, [x + 1, z], [x, z]],
    ];
    for (const [nx, nz, a, b] of sides) if (!mask.has(`${nx},${nz}`)) edges.push([a, b]);
  }
  const starts = new Map<string, number[]>();
  edges.forEach(([a], i) => {
    const list = starts.get(key(a)) ?? [];
    list.push(i);
    starts.set(key(a), list);
  });
  let ambiguous = [...starts.values()].some((a) => a.length !== 1);
  let fallback = ambiguous;
  const remaining = new Set(edges.map((_, i) => i)),
    loops: CoastPoint[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as number;
    let current = first;
    const loop: CoastPoint[] = [];
    while (remaining.has(current)) {
      const [a, b] = edges[current]!;
      loop.push(a);
      remaining.delete(current);
      if (key(b) === key(edges[first]![0])) break;
      const next = starts.get(key(b))?.find((i) => remaining.has(i));
      if (next === undefined) {
        fallback = true;
        ambiguous = true;
        break;
      }
      current = next;
    }
    loops.push(loop);
  }
  if (loops.length !== 1) fallback = true;
  let outlines = loops,
    tri: number[] | null = null;
  if (!fallback) {
    const curve = smooth(loops[0]!, seed, protectedRects, size > 64 ? 2 : 4);
    tri = simple(curve) ? triangulate(curve) : null;
    if (tri) outlines = [curve];
    else fallback = true;
  }
  const mesh = emptyNaturalMesh(),
    green = [0.53, 0.68, 0.31];
  if (fallback) {
    // Merge adjacent cell tops into horizontal strips. Lake holes and reclaimed
    // tiles stay exact without expanding a 192-grid island into 140k vertices.
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        if (!mask.has(`${x},${z}`)) continue;
        const start = x;
        while (x + 1 < size && mask.has(`${x + 1},${z}`)) x++;
        const end = x + 1,
          o = mesh.positions.length / 3;
        for (const [xx, zz] of [
          [start, z],
          [start, z + 1],
          [end, z + 1],
          [end, z],
        ])
          coastVertex(mesh, xx!, 0.015, zz!, 0, 1, 0, green);
        mesh.indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
      }
  } else {
    for (const [x, z] of outlines[0]!) coastVertex(mesh, x, 0.015, z, 0, 1, 0, green);
    mesh.indices.push(...tri!);
  }
  // Ambiguous corner contacts use exact edges. Ordinary lake holes keep exact
  // inner banks while the independent outer contour still receives a beach.
  const wallPolys = ambiguous ? edges.map((e) => [...e]) : outlines;
  const waterlines = appendCoastalBeach(mesh, wallPolys, seed, protectedRects, ambiguous, mask);
  if (!mesh.positions.length) {
    mesh.min = [0, 0, 0];
    mesh.max = [0, 0, 0];
  }
  return {
    mesh,
    outlines,
    waterlines: ambiguous ? outlines : waterlines,
    coastFallback: fallback,
    boundary: edges.map(([a]) => a),
  };
}
