interface Vertex {
  x: number;
  z: number;
  ground: number;
  top: number;
}
function clip(
  polygon: readonly Vertex[],
  field: 'ground' | 'top',
  level: number,
  above: boolean,
): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!;
    const ai = above ? a[field] >= level : a[field] < level;
    const bi = above ? b[field] >= level : b[field] < level;
    if (ai) result.push(a);
    if (ai !== bi) {
      const t = (level - a[field]) / (b[field] - a[field]);
      result.push({
        x: a.x + t * (b.x - a.x),
        z: a.z + t * (b.z - a.z),
        ground: a.ground + t * (b.ground - a.ground),
        top: a.top + t * (b.top - a.top),
        [field]: level,
      });
    }
  }
  return result;
}
/** Integrate the positive solid directly. Subtracting two nearly equal full-cell volumes
 * would erase a real thin mineral wedge at a Float32 boundary. Four clipped affine regions
 * keep positive material thickness local before multiplication by projected area.
 */
export function v6SlabVolume(triangle: readonly Vertex[], lower: number, upper: number): number {
  const domain = clip(clip(triangle, 'top', lower, true), 'ground', upper, false);
  let volume = 0;
  for (const groundAbove of [false, true])
    for (const topBelow of [false, true]) {
      const region = clip(clip(domain, 'ground', lower, groundAbove), 'top', upper, !topBelow);
      for (let i = 1; i + 1 < region.length; i++) {
        const points = [region[0]!, region[i]!, region[i + 1]!] as const;
        const [a, b, c] = points;
        const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
        const thickness =
          points.reduce(
            (sum, p) =>
              sum + Math.max(0, (topBelow ? p.top : upper) - (groundAbove ? p.ground : lower)),
            0,
          ) / 3;
        volume += area * thickness;
      }
    }
  return volume;
}
