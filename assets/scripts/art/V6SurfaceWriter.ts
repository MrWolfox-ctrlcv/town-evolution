import { v6WorldHeight } from './V6SurfaceSamples';
import type {
  V6SurfaceSource,
  V6SurfaceMesh,
  V6SurfaceTriangle,
  V6SurfaceMaterial as Material,
  V6SurfacePoint as P,
} from './V6SurfaceContracts';
import { v6Plane as plane } from './V6SurfaceContracts';
import { v6SurfaceNormal } from './V6SurfaceNormals';
import type { V3 as V } from './AssetTypes';
/** Split an exposed face at the actual soil-base / original resource interface. */
function materialClip(ps: P[], above: boolean): P[] {
  const out: P[] = [];
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]!,
      b = ps[(i + 1) % ps.length]!,
      da = a.h - a.g,
      db = b.h - b.g;
    const ia = above ? da >= 0 : da <= 0,
      ib = above ? db >= 0 : db <= 0;
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = da / (da - db);
      out.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        h: a.h + (b.h - a.h) * t,
        g: a.g + (b.g - a.g) * t,
      });
    }
  }
  return out;
}
export function v6SurfaceWriter(state: V6SurfaceSource, mesh: V6SurfaceMesh) {
  const world = state.world;
  // Per-cell exact attribute identity. Preserve signed zero and every original
  // component; only indices change, never an expanded triangle or its metadata.
  const vertices = new Map<string, number[]>();
  const retained = new Map<string, number>();
  const metadata = new Map<string, V6SurfaceTriangle>();
  const component = (value: number) => (Object.is(value, -0) ? '-0' : String(value));
  function emit(
    points: P[],
    x: number,
    z: number,
    surface: 'natural' | 'cut' | 'wall',
    material: Material | 'grass',
    normal?: V,
  ) {
    const r = state.resourceAt(x, z);
    for (let i = 1; i + 1 < points.length; i++) {
      const ps = [points[0]!, points[i]!, points[i + 1]!],
        vs = ps.map((p) => [Math.fround(p.x), Math.fround(p.h), Math.fround(p.z)] as V);
      const u = vs[1]!.map((v, k) => v - vs[0]![k]!),
        v = vs[2]!.map((v, k) => v - vs[0]![k]!);
      if (
        Math.hypot(
          u[1]! * v[2]! - u[2]! * v[1]!,
          u[2]! * v[0]! - u[0]! * v[2]!,
          u[0]! * v[1]! - u[1]! * v[0]!,
        ) < 1e-12
      )
        continue;
      const exposed = ps.some((p) => Math.fround(p.h) > Math.fround(p.g));
      const resourceId = surface === 'natural' && exposed ? (r?.id ?? null) : null;
      const ownMaterial =
        surface === 'natural' ? (resourceId && r?.kind === 'stone' ? 'stone' : 'grass') : material;
      for (let k = 0; k < 3; k++) {
        const p = ps[k]!,
          n =
            normal ??
            v6SurfaceNormal(
              world,
              p.x,
              p.z,
              !state.world.resourceAt(x, z) || (state.capAt(x, z) !== Infinity && !exposed),
            );
        let color =
          ownMaterial === 'grass'
            ? [0.5, 0.68, 0.29, 1]
            : ownMaterial === 'stone'
              ? [0.55, 0.54, 0.5, 1]
              : [0.43, 0.3, 0.17, 1];
        if (surface === 'wall')
          color = color.map((a, i) =>
            i < 3 ? a + (Math.floor((p.h - plane(0)) * 2) % 2) * 0.025 : a,
          );
        const key = vs[k]!.map(component).join(',');
        let bucket = vertices.get(key);
        let index = bucket?.find(
          (v) =>
            n.every((value, a) => Object.is(value, mesh.normals[v * 3 + a])) &&
            color.every((value, a) => Object.is(value, mesh.colors[v * 4 + a])),
        );
        if (index !== undefined) {
          mesh.indices.push(index);
          continue;
        }
        index = mesh.positions.length / 3;
        if (index >= 262144) throw Error('Terrain cell exceeds CPU vertex budget');
        if (!bucket) {
          bucket = [];
          vertices.set(key, bucket);
        }
        bucket.push(index);
        mesh.indices.push(index);
        mesh.positions.push(...vs[k]!);
        for (let axis = 0; axis < 3; axis++) {
          mesh.min[axis] = Math.min(mesh.min[axis]!, vs[k]![axis]!);
          mesh.max[axis] = Math.max(mesh.max[axis]!, vs[k]![axis]!);
        }
        mesh.normals.push(...n);
        mesh.colors.push(...color);
      }
      const metaKey = `${x},${z},${surface},${resourceId},${ownMaterial}`;
      let meta = metadata.get(metaKey);
      if (!meta) {
        meta = Object.freeze({ x, z, surface, resourceId, material: ownMaterial });
        metadata.set(metaKey, meta);
      }
      mesh.triangles.push(meta);
    }
  }
  return (
    points: P[],
    x: number,
    z: number,
    surface: 'natural' | 'cut' | 'wall',
    normal?: V,
    filled?: Material,
  ) => {
    if (surface === 'natural') {
      emit(points, x, z, surface, 'grass', normal);
      return;
    }
    if (filled) {
      // A filled stratum can share its layer with original stone. Split at the
      // actual retained sloping surface, not merely at the integer layer plane.
      const fillPoints = points.map((p) => {
        const key = `${x},${z},${component(p.x)},${component(p.z)}`;
        let g = retained.get(key);
        if (g === undefined) {
          g = state.retainedHeightInCell(p.x, p.z, x, z);
          retained.set(key, g);
        }
        return { ...p, g };
      });
      const above = fillPoints.some((p) => Math.fround(p.h) > Math.fround(p.g));
      const below = fillPoints.some((p) => Math.fround(p.h) < Math.fround(p.g));
      if (above) emit(materialClip(fillPoints, true), x, z, surface, filled, normal);
      if (above && !below) return;
      // Coincident original/fill boundaries retain exactly one original surface.
      points = (below ? materialClip(fillPoints, false) : fillPoints).map((p) => ({
        ...p,
        g: v6WorldHeight(world, p.x, p.z, true),
      }));
    }
    // No duplicate co-planar base face: zero thickness belongs solely to base soil.
    if (points.every((p) => p.h <= p.g)) {
      emit(points, x, z, surface, 'soil', normal);
      return;
    }
    emit(materialClip(points, false), x, z, surface, 'soil', normal);
    emit(materialClip(points, true), x, z, surface, world.resourceAt(x, z)?.kind ?? 'soil', normal);
  };
}
