import type { geometry } from 'cc';
import type { Point } from '../application/MapGesture';
import type { ObjectBounds } from '../application/ObjectSelection';

export interface TouchPickContext {
  point: Point;
  radius: number;
  project(world: { x: number; y: number; z: number }): Point;
  ray(point: Point): geometry.Ray;
  contains(point: Point): boolean;
}
export type VisibleHit =
  | { kind: 'building' | 'tree' | 'drop'; id: string; distance: number }
  | { kind: 'pile'; id: string; x: number; z: number; distance: number }
  | { kind: 'natural'; id: string; distance: number; point: { x: number; y: number; z: number } };
export interface TouchCandidate {
  pick(ray: geometry.Ray): VisibleHit | null;
}
const contexts = new WeakMap<geometry.Ray, TouchPickContext>();
export function markTouchRay(ray: geometry.Ray, context: TouchPickContext): geometry.Ray {
  contexts.set(ray, context);
  return ray;
}
export function touchPickContext(ray: geometry.Ray): TouchPickContext | undefined {
  return contexts.get(ray);
}
/** Projection of mesh extents is rejection only, never a selectable surface. */
export function nearProjectedBounds(
  bounds: ObjectBounds,
  context: TouchPickContext,
  world = (point: { x: number; y: number; z: number }) => point,
): boolean {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const p = context.project(world({ x, y, z }));
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
  const dx = Math.max(minX - context.point.x, 0, context.point.x - maxX),
    dy = Math.max(minY - context.point.y, 0, context.point.y - maxY);
  return dx * dx + dy * dy <= context.radius * context.radius;
}
const samples = Array.from({ length: 7 }, (_, x) => x - 3)
  .flatMap((x) => Array.from({ length: 7 }, (_, y) => ({ x, y: y - 3 })))
  .map((p) => ({ ...p, square: p.x * p.x + p.y * p.y }))
  .filter((p) => p.square > 0 && p.square <= 9)
  .sort((a, b) => a.square - b.square || a.x - b.x || a.y - b.y);
export function nearerHit(a: VisibleHit | null, b: VisibleHit | null): VisibleHit | null {
  if (!b) return a;
  if (!a) return b;
  if (Math.abs(a.distance - b.distance) > 1e-8) return a.distance < b.distance ? a : b;
  return `${a.kind}:${a.id}` < `${b.kind}:${b.id}` ? a : b;
}
/** At most 28 exact neighboring rays; closest screen ring wins, depth resolves equal rings. */
export function nearbyTouchHit(
  context: TouchPickContext,
  candidates: readonly TouchCandidate[],
): VisibleHit | null {
  if (!Number.isFinite(context.radius) || context.radius <= 0 || !context.contains(context.point))
    return null;
  let best: VisibleHit | null = null,
    square = 0;
  for (const sample of samples) {
    if (best && sample.square !== square) return best;
    square = sample.square;
    const point = {
      x: context.point.x + (sample.x * context.radius) / 3,
      y: context.point.y + (sample.y * context.radius) / 3,
    };
    if (!context.contains(point)) continue;
    const ray = context.ray(point);
    for (const candidate of candidates) best = nearerHit(best, candidate.pick(ray));
  }
  return best;
}
