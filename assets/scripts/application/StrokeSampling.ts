import type { Point } from './MapGesture';
/** Interpolate coalesced pointer moves so narrow fields are not skipped by a fast sweep. */
export function sampleStroke(from: Point | null, to: Point, step = 12): Point[] {
  if (![to.x, to.y, step].every(Number.isFinite) || step <= 0) return [];
  if (!from || ![from.x, from.y].every(Number.isFinite)) return [{ ...to }];
  const count = Math.min(
    256,
    Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step)),
  );
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });
}
