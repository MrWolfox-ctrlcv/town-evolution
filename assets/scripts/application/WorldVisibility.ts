export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}
/** Unknown bounds are retained. This predicate only rejects proven off-frustum boxes. */
export type WorldBoxTest = (min: Readonly<WorldPoint>, max: Readonly<WorldPoint>) => boolean;
