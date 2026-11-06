import { v6WorldHeight } from './V6SurfaceSamples';
import type { V6SurfaceSource, V6SurfaceMesh, V6SurfacePoint as P } from './V6SurfaceContracts';
import { v6Plane as plane } from './V6SurfaceContracts';
import { v6SurfaceWriter } from './V6SurfaceWriter';
import { v6ExactFlatTriangles } from './V6ExactFlatCell';
import { v6Clip } from './V6SurfaceClip';
/** Genuine CPU triangle mesh. Unedited triangle source and normals are unchanged. */
export function* buildV6SurfaceMeshSteps(
  state: V6SurfaceSource,
  x0: number,
  z0: number,
  width: number,
  depth: number,
): Generator<V6SurfaceMesh, V6SurfaceMesh> {
  if (
    ![x0, z0, width, depth].every(Number.isInteger) ||
    width < 1 ||
    depth < 1 ||
    width > 32 ||
    depth > 32 ||
    x0 < 0 ||
    z0 < 0 ||
    x0 + width > 192 ||
    z0 + depth > 192
  )
    throw Error('Invalid mesh rectangle');
  const mesh: V6SurfaceMesh = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    triangles: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const world = state.world;
  const add = v6SurfaceWriter(state, mesh);
  const p = (x: number, z: number): P => ({
    x,
    z,
    h: v6WorldHeight(world, x, z, false),
    g: v6WorldHeight(world, x, z, true),
  });
  for (let z = z0; z < z0 + depth; z++)
    for (let x = x0; x < x0 + width; x++) {
      const c = world.at(x, z);
      if (!c || c.reserved) continue;
      const edit = state.editAt(x, z),
        cap = state.capAt(x, z);
      const flat = v6ExactFlatTriangles(state, x, z);
      if (flat) for (const triangle of flat) add(triangle, x, z, 'natural');
      else
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++) {
            const a = p(x + i / 4, z + j / 4),
              b = p(x + i / 4, z + (j + 1) / 4),
              c = p(x + (i + 1) / 4, z + (j + 1) / 4),
              d = p(x + (i + 1) / 4, z + j / 4);
            for (const t of [
              [a, b, c],
              [a, c, d],
            ]) {
              if (edit) {
                add(
                  t.map((q) => ({ ...q, h: plane(edit.level) })),
                  x,
                  z,
                  'cut',
                  [0, 1, 0],
                  edit.fills.find((f) => f.level === edit.level)?.material,
                );
                continue;
              }
              if (cap === -Infinity) {
                add(
                  t.map((q) => ({ ...q, h: q.g })),
                  x,
                  z,
                  'natural',
                );
                continue;
              }
              if (cap === Infinity) {
                add(t, x, z, 'natural');
                continue;
              }
              add(v6Clip(t, 'h', cap, true), x, z, 'natural');
              const above = v6Clip(t, 'h', cap, false);
              add(
                v6Clip(above, 'g', cap, true).map((q) => ({ ...q, h: cap })),
                x,
                z,
                'cut',
                [0, 1, 0],
              );
              add(
                v6Clip(above, 'g', cap, false).map((q) => ({ ...q, h: q.g })),
                x,
                z,
                'natural',
              );
            }
          }
      yield mesh;
      const edges = [
        { a: [0, 1], b: [0, 0], dx: -1, dz: 0, n: [-1, 0, 0] },
        { a: [1, 0], b: [1, 1], dx: 1, dz: 0, n: [1, 0, 0] },
        { a: [0, 0], b: [1, 0], dx: 0, dz: -1, n: [0, 0, -1] },
        { a: [1, 1], b: [0, 1], dx: 0, dz: 1, n: [0, 0, 1] },
      ] as const;
      for (const e of edges) {
        if (!world.at(x + e.dx, z + e.dz) || world.at(x + e.dx, z + e.dz)!.reserved) continue;
        if (
          !edit &&
          !state.editAt(x + e.dx, z + e.dz) &&
          state.capAt(x, z) === state.capAt(x + e.dx, z + e.dz)
        )
          continue;
        for (let s = 0; s < 4; s++) {
          const q = (t: number) =>
            p(x + e.a[0] + (e.b[0] - e.a[0]) * t, z + e.a[1] + (e.b[1] - e.a[1]) * t);
          const a = q(s / 4),
            b = q((s + 1) / 4),
            breaks = [0, 1];
          // Piecewise caps and crossing heights are split before constructing one-sided faces.
          for (const value of [
            state.capAt(x, z),
            edit?.cut ?? Infinity,
            state.capAt(x + e.dx, z + e.dz),
            state.editAt(x + e.dx, z + e.dz)?.cut ?? Infinity,
            edit ? plane(edit.level) : Infinity,
            state.editAt(x + e.dx, z + e.dz)
              ? plane(state.editAt(x + e.dx, z + e.dz)!.level)
              : Infinity,
          ])
            if (Number.isFinite(value))
              for (const field of ['h', 'g'] as const)
                if ((a[field] - value) * (b[field] - value) < 0)
                  breaks.push((value - a[field]) / (b[field] - a[field]));
          breaks.sort((a, b) => a - b);
          for (let n = 0; n + 1 < breaks.length; n++) {
            const mix = (t: number): P => ({
              x: a.x + (b.x - a.x) * t,
              z: a.z + (b.z - a.z) * t,
              h: 0,
              g: a.g + (b.g - a.g) * t,
            });
            const aa = mix(breaks[n]!),
              bb = mix(breaks[n + 1]!);
            const ht = (q: P, cx: number, cz: number) =>
              Math.fround(state.heightInCell(q.x, q.z, cx, cz));
            const ta = ht(aa, x, z),
              tb = ht(bb, x, z),
              la = ht(aa, x + e.dx, z + e.dz),
              lb = ht(bb, x + e.dx, z + e.dz);
            if (ta + tb <= la + lb) continue;
            const face = [
              { ...aa, h: Math.min(ta, la) },
              { ...aa, h: ta },
              { ...bb, h: tb },
              { ...bb, h: Math.min(tb, lb) },
            ];
            const low = Math.min(la, lb),
              high = Math.max(ta, tb);
            for (let layer = 0; layer < 64; layer++)
              if (plane(layer + 1) > low && plane(layer) < high) {
                add(
                  v6Clip(v6Clip(face, 'h', plane(layer), false), 'h', plane(layer + 1), true),
                  x,
                  z,
                  'wall',
                  e.n,
                  edit?.fills.find((f) => f.level === layer + 1)?.material,
                );
                yield mesh;
              }
          }
        }
      }
    }
  if (!mesh.indices.length) mesh.min = mesh.max = [0, 0, 0];
  return mesh;
}

/** Offline convenience. Runtime consumes the same generator in bounded slices. */
export function buildV6SurfaceMesh(
  state: V6SurfaceSource,
  x: number,
  z: number,
  width: number,
  depth: number,
): V6SurfaceMesh {
  const work = buildV6SurfaceMeshSteps(state, x, z, width, depth);
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}
