export interface Point {
  x: number;
  y: number;
}
/** Matches Cocos Touch.getUILocation; input already uses physical bottom-left screen pixels. */
export function collectionSource(
  point: Point,
  viewport: Point,
  scale: Point,
  canvas: Point,
): Point {
  return {
    x: (point.x - viewport.x) / scale.x - canvas.x / 2,
    y: (point.y - viewport.y) / scale.y - canvas.y / 2,
  };
}
/** Small upward arc, with an exact source and destination at its endpoints. */
export function collectionPoint(source: Point, target: Point, progress: number): Point {
  const t = Math.max(0, Math.min(1, progress));
  const ease = t * t * (3 - 2 * t);
  return {
    x: source.x + (target.x - source.x) * ease,
    y: source.y + (target.y - source.y) * ease + Math.sin(Math.PI * t) * 38,
  };
}

/** Visual startup can fail independently of inventory; never leave an orphan at the source. */
export function startCollectionEffect(start: () => void, abort: () => void): void {
  try {
    start();
  } catch (error) {
    abort();
    throw error;
  }
}
