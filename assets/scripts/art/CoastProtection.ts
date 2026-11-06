export type CoastPoint = readonly [number, number];
/** Real world-space footprint. Default margin 2.5 also protects the current dock's exits. */
export interface CoastProtection {
  x: number;
  z: number;
  width: number;
  depth: number;
  margin?: number;
}
export interface CoastProtectionSnapshot {
  /** Raw mask vertices determine smoothing locks before the curve is generated. */
  boundary: readonly CoastPoint[];
  outlines: readonly (readonly CoastPoint[])[];
  coastFallback: boolean;
}
export function protectedCoastPoint(p: CoastPoint, rects: readonly CoastProtection[]): boolean {
  return rects.some((r) => {
    const m = r.margin ?? 2.5;
    return (
      p[0] >= r.x - m && p[0] <= r.x + r.width + m && p[1] >= r.z - m && p[1] <= r.z + r.depth + m
    );
  });
}
/** Exact geometry dependencies, independent of building IDs, order, or inland changes.
 * Raw coverage controls smoothing. Final-curve coverage controls wall offsets.
 * After a rebuild, evaluate again against the new curve, not the previous one. */
export function coastProtectionSignature(
  coast: CoastProtectionSnapshot,
  rects: readonly CoastProtection[],
): string {
  const coverage = (points: readonly CoastPoint[]) =>
    points.map((p) => (protectedCoastPoint(p, rects) ? '1' : '0')).join('');
  return `${coverage(coast.boundary)}|${
    coast.coastFallback ? '' : coast.outlines.map(coverage).join('/')
  }`;
}
