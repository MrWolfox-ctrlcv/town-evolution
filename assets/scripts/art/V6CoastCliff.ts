import type { V6Hydrology as V5Hydrology } from '../domain/v6-hydrology';
import type { V5MeshWriter, V5SurfaceVertex } from './V5CoastMesh';
import { v5SurfaceSampler } from './V5CoastMesh';
import type { V3 } from './AssetTypes';
type Point = readonly [number, number];
/** Exact cell-aligned clipping against the same quarter-linear shoreline used by domain proofs. */
export function v5CliffTileBuilder(field: V5Hydrology, filled: ReadonlySet<string>) {
  const coast = field.naturalCoast,
    baseSample = v5SurfaceSampler(field.base),
    bounds = coast.patchBounds;
  const origin = coast.toWorld(0, 0),
    uu = coast.toWorld(1, 0),
    vv = coast.toWorld(0, 1);
  const ux = uu[0] - origin[0],
    uz = uu[1] - origin[1],
    vx = vv[0] - origin[0],
    vz = vv[1] - origin[1];
  function distance(p: Point): number {
    return p[1] - coast.shore(p[0]);
  }
  function intersection(a: Point, b: Point): Point {
    if (a[0] === b[0]) return [a[0], coast.shore(a[0])];
    const u0 = Math.floor(Math.min(a[0], b[0]) * 4) / 4;
    const h0 = coast.shore(u0),
      slope = (coast.shore(u0 + 0.25) - h0) * 4;
    if (Math.abs(slope) < 1e-14) return a;
    const u = u0 + (a[1] - h0) / slope;
    return [Math.abs(u * 4 - Math.round(u * 4)) < 1e-10 ? Math.round(u * 4) / 4 : u, a[1]];
  }
  function clip(poly: Point[], water: boolean): Point[] {
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!,
        b = poly[(i + 1) % poly.length]!,
        da = distance(a),
        db = distance(b);
      const ia = water ? da >= -1e-12 : da <= 1e-12,
        ib = water ? db >= -1e-12 : db <= 1e-12;
      if (ia) out.push(a);
      if (ia !== ib) out.push(intersection(a, b));
    }
    return out.filter(
      (p, i) =>
        !out
          .slice(0, i)
          .some((q) => Math.abs(p[0] - q[0]) < 1e-11 && Math.abs(p[1] - q[1]) < 1e-11),
    );
  }
  function vertex(p: Point, water: boolean): V5SurfaceVertex {
    const [x, z] = coast.toWorld(...p);
    if (!water) return baseSample(x, z);
    p = coast.toLocal(x, z); // Canonical round trip also used by fill-wall physical sampling.
    const s = coast.sampleWaterBedLocal(...p);
    if (
      s.influence === 0 ||
      x === bounds.x0 ||
      x === bounds.x1 ||
      z === bounds.z0 ||
      z === bounds.z1
    )
      return baseSample(x, z);
    const e = 0.005,
      du =
        (coast.sampleWaterBedLocal(p[0] + e, p[1]).height -
          coast.sampleWaterBedLocal(p[0] - e, p[1]).height) /
        (2 * e);
    const dv =
      (coast.sampleWaterBedLocal(p[0], p[1] + e).height -
        coast.sampleWaterBedLocal(p[0], p[1] - e).height) /
      (2 * e);
    const n: V3 = [-du * ux - dv * vx, 1, -du * uz - dv * vz],
      length = Math.hypot(...n);
    return {
      position: [x, s.height, z],
      normal: [n[0] / length, n[1] / length, n[2] / length],
      color: s.color,
    };
  }
  function polygon(writer: V5MeshWriter, points: Point[], water: boolean): void {
    for (let i = 1; i + 1 < points.length; i++)
      writer.triangle(
        vertex(points[0]!, water),
        vertex(points[i]!, water),
        vertex(points[i + 1]!, water),
      );
  }
  return (writer: V5MeshWriter, x: number, z: number): void => {
    const poly: Point[] = [
      [x, z],
      [x, z + 0.25],
      [x + 0.25, z + 0.25],
      [x + 0.25, z],
    ].map((p) => coast.toLocal(p[0]!, p[1]!));
    const minU = Math.min(...poly.map((p) => p[0])),
      maxU = Math.max(...poly.map((p) => p[0]));
    if (maxU <= -8 || minU >= 8) {
      // The wall ends at |u|=8. Continue its endpoint only on this adjoining tile edge,
      // not a fictitious split all the way to the replacement rectangle perimeter.
      const ring: Point[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!,
          b = poly[(i + 1) % poly.length]!;
        ring.push(a);
        if (a[0] === b[0] && Math.abs(a[0]) === 8) {
          const v = coast.shore(a[0]);
          if (v > Math.min(a[1], b[1]) + 1e-12 && v < Math.max(a[1], b[1]) - 1e-12)
            ring.push([a[0], v]);
        }
      }
      if (ring.length === 4) polygon(writer, ring, false);
      else {
        const center = vertex(coast.toLocal(x + 0.125, z + 0.125), false);
        for (let i = 0; i < ring.length; i++)
          writer.triangle(
            center,
            vertex(ring[i]!, false),
            vertex(ring[(i + 1) % ring.length]!, false),
          );
      }
      return;
    }
    polygon(writer, clip(poly, false), false);
    polygon(writer, clip(poly, true), true);
    // Only the cell with positive water-side area owns a boundary wall segment.
    if (Math.max(...poly.map(distance)) <= 1e-12) return;
    const cuts: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!,
        b = poly[(i + 1) % poly.length]!,
        da = distance(a),
        db = distance(b);
      if (Math.abs(da) < 1e-11) cuts.push(a);
      if (da * db < 0) cuts.push(intersection(a, b));
    }
    const unique = cuts
      .filter(
        (p, i) =>
          !cuts
            .slice(0, i)
            .some((q) => Math.abs(p[0] - q[0]) < 1e-11 && Math.abs(p[1] - q[1]) < 1e-11),
      )
      .sort((a, b) => a[0] - b[0]);
    if (unique.length < 2) return;
    const a = unique[0]!,
      b = unique[unique.length - 1]!,
      mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const side of [-1, 1]) {
      const [xx, zz] = coast.toWorld(mid[0], mid[1] + side * 1e-7);
      if (filled.has(`${Math.floor(xx)},${Math.floor(zz)}`)) return;
    }
    const top = [vertex(a, false), vertex(b, false)],
      bed = [vertex(a, true), vertex(b, true)];
    const dx = top[1]!.position[0] - top[0]!.position[0],
      dz = top[1]!.position[2] - top[0]!.position[2],
      length = Math.hypot(dx, dz);
    if (length < 1e-12) return;
    const normal: V3 = [-dz / length, 0, dx / length];
    function wallPoint(i: number, t: number): V5SurfaceVertex {
      const p = top[i]!.position,
        y = p[1] * (1 - t) + bed[i]!.position[1] * t,
        u = i ? a[0] + (b[0] - a[0]) : a[0];
      const fleck =
        0.035 * Math.sin(u * 3.7 + y * 16 + field.seed * 0.001) +
        0.017 * Math.sin(u * 7.3 - y * 11);
      let moss = Math.max(0, Math.min(1, (y + 0.12) / 0.135));
      moss = moss * moss * (3 - 2 * moss) * 0.38;
      return {
        position: [p[0], y, p[2]],
        normal,
        color: [0.43, 0.45, 0.39].map(
          (c, k) => (c + fleck) * (1 - moss) + [0.53, 0.68, 0.31][k]! * moss,
        ) as unknown as V3,
      };
    }
    for (let i = 0; i < 8; i++) {
      const aa = wallPoint(0, i / 8),
        bb = wallPoint(0, (i + 1) / 8),
        cc = wallPoint(1, (i + 1) / 8),
        dd = wallPoint(1, i / 8);
      writer.triangle(aa, bb, cc);
      writer.triangle(aa, cc, dd);
    }
  };
}
