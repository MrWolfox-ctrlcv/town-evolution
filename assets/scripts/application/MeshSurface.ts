export interface SurfaceRay {
  o: { x: number; y: number; z: number };
  d: { x: number; y: number; z: number };
}
/** Indexed triangles copied from the rendered mesh, with bounds used only for rejection. */
export class MeshSurface {
  private readonly min: [number, number, number] = [Infinity, Infinity, Infinity];
  private readonly max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  get bounds() {
    return { min: this.min, max: this.max };
  }
  constructor(
    private readonly positions: ArrayLike<number>,
    private readonly indices: ArrayLike<number>,
  ) {
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      this.min[axis] = Math.min(this.min[axis]!, positions[i]!);
      this.max[axis] = Math.max(this.max[axis]!, positions[i]!);
    }
  }
  /** Keep the ray direction unnormalized after inverse transforms: t stays in world units. */
  distance(ray: SurfaceRay, limit = Infinity): number | null {
    let near = 0,
      far = limit;
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      const key = axis as 'x' | 'y' | 'z',
        o = ray.o[key],
        d = ray.d[key];
      if (Math.abs(d) < 1e-12) {
        if (o < this.min[i]! || o > this.max[i]!) return null;
      } else {
        const a = (this.min[i]! - o) / d,
          b = (this.max[i]! - o) / d;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) return null;
      }
    }
    let closest: number | null = null;
    const p = this.positions,
      indices = this.indices;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]! * 3,
        b = indices[i + 1]! * 3,
        c = indices[i + 2]! * 3;
      const ux = p[b]! - p[a]!,
        uy = p[b + 1]! - p[a + 1]!,
        uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!,
        vy = p[c + 1]! - p[a + 1]!,
        vz = p[c + 2]! - p[a + 2]!;
      const hx = ray.d.y * vz - ray.d.z * vy,
        hy = ray.d.z * vx - ray.d.x * vz,
        hz = ray.d.x * vy - ray.d.y * vx;
      const determinant = ux * hx + uy * hy + uz * hz;
      // Generated town materials cull back faces. Empty space between components is a miss.
      if (determinant <= 1e-12) continue;
      const sx = ray.o.x - p[a]!,
        sy = ray.o.y - p[a + 1]!,
        sz = ray.o.z - p[a + 2]!;
      const u = (sx * hx + sy * hy + sz * hz) / determinant;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const qx = sy * uz - sz * uy,
        qy = sz * ux - sx * uz,
        qz = sx * uy - sy * ux;
      const v = (ray.d.x * qx + ray.d.y * qy + ray.d.z * qz) / determinant;
      if (v < -1e-9 || u + v > 1 + 1e-9) continue;
      const t = (vx * qx + vy * qy + vz * qz) / determinant;
      if (t >= 0 && t <= limit && (closest === null || t < closest)) closest = t;
    }
    return closest;
  }
}
