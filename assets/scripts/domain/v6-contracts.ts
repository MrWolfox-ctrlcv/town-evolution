/** Explicit new-world generator. Never changes a published v1-v5 world or revision. */
export const V6_GENERATOR_REVISION = 'v6-natural-grass-edits-1';
export const V6_SIZE = 192;
export const V6_BASE = Math.fround(0.015);
export const v6StratumPlane = (level: number): number => Math.fround(0.015 + level);
export const V6_SUBDIVISIONS = 4;
export type V6Biome = 'plain' | 'hill' | 'mountain' | 'forest';
export interface V6Resource {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly kind: 'stone' | 'soil';
  /** Original occupied geometry strata, not output quantity. V6 edits derive real material volume. */
  readonly amount: number;
}
export interface V6Cell {
  readonly x: number;
  readonly z: number;
  readonly biome: V6Biome;
  readonly baseElevation: number;
  readonly naturalHeight: number;
  readonly groundRange: readonly [number, number];
  readonly resource: V6Resource | null;
  readonly reserved: boolean;
}
export interface V6Foundation {
  readonly allowed: boolean;
  readonly reason: 'flat' | 'water-or-reserved' | 'live-resource' | 'live-tree' | 'slope';
  /** Absolute world Y. NOT a soil layer count. Null when rejected. */
  readonly baseElevation: number | null;
  readonly heightSpread: number;
  readonly terrainRevision: typeof V6_GENERATOR_REVISION;
}
export interface V6Snapshot {
  /** Explicit complete live list. A missing ID is exhausted; never regenerated. */
  readonly resources: ReadonlyMap<string, V6Resource>;
  readonly trees: ReadonlySet<string>;
}
export interface Deposit {
  readonly resource: V6Resource;
  readonly ceiling: number;
  readonly floor: number;
  readonly levels: readonly number[];
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const v6Smooth = (t: number) => {
  t = clamp01(t);
  return t * t * t * (10 - 15 * t + 6 * t * t);
};
/** Each nonzero linear triangle bounds a convex solid between two planes. Its vertical
 * projection is the continuous open interval (min ground, max top), NOT the union of
 * three vertex intervals. This includes occupied middle layers of a thin sloping sheet. */
export function occupiedV6TriangleLevels(
  triangle: readonly { ground: number; top: number }[],
): readonly number[] {
  if (
    triangle.length !== 3 ||
    triangle.some(
      (p) => !Number.isFinite(p.ground) || !Number.isFinite(p.top) || p.top < p.ground - 1e-10,
    )
  )
    throw Error('Invalid v6 solid triangle');
  const q = triangle.map((p) => ({
    ground: Math.fround(p.ground),
    top: Math.fround(p.top),
  }));
  if (
    q.some(
      (p) =>
        !Number.isFinite(p.ground) ||
        !Number.isFinite(p.top) ||
        Math.abs(p.ground) > 128 ||
        Math.abs(p.top) > 128,
    )
  )
    throw Error('V6 triangle outside height bounds');
  if (!q.some((p) => p.top > p.ground)) return Object.freeze([]);
  const min = Math.min(...q.map((p) => p.ground)),
    max = Math.max(...q.map((p) => p.top));
  const out: number[] = [];
  for (let level = Math.floor(min - V6_BASE) - 1; level <= Math.ceil(max - V6_BASE) + 1; level++)
    if (min < v6StratumPlane(level) && max > v6StratumPlane(level - 1)) out.push(level);
  return Object.freeze(out);
}
export const key = (x: number, z: number) => `${x},${z}`;
export const inWorld = (x: number, z: number) =>
  Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < V6_SIZE && z < V6_SIZE;
