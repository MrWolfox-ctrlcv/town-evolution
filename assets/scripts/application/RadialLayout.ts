export interface RadialPoint {
  x: number;
  y: number;
}
export interface RadialRect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}
export function overlaps(a: RadialRect, b: RadialRect, gap = 0): boolean {
  return (
    a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.bottom < b.top + gap &&
    a.top > b.bottom - gap
  );
}
export function pointRect(p: RadialPoint, width: number, height: number): RadialRect {
  return {
    left: p.x - width / 2,
    right: p.x + width / 2,
    bottom: p.y - height / 2,
    top: p.y + height / 2,
  };
}
export function screenBounds(points: readonly RadialPoint[]): RadialRect | null {
  if (!points.length || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return null;
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    bottom: Math.min(...points.map((p) => p.y)),
    top: Math.max(...points.map((p) => p.y)),
  };
}
/** A hollow object-sized orbit. At screen edges only the inward-facing arc is used. */
export function radialLayout(
  width: number,
  height: number,
  object: RadialRect,
  count: number,
  obstacles: readonly RadialRect[] = [],
) {
  const safe = {
    left: -width / 2 + 8,
    right: width / 2 - 8,
    bottom: -height / 2 + 84,
    top: height / 2 - 58,
  };
  const center = { x: (object.left + object.right) / 2, y: (object.bottom + object.top) / 2 };
  const visible = overlaps(object, safe);
  const wanted = Math.min(8, Math.max(0, count));
  const inside = (r: RadialRect) =>
    r.left >= safe.left && r.right <= safe.right && r.bottom >= safe.bottom && r.top <= safe.top;
  const clear = (r: RadialRect, occupied: readonly RadialRect[]) =>
    inside(r) && !overlaps(r, object, 12) && !occupied.some((b) => overlaps(r, b, 5));
  let best: RadialPoint[] = [];
  let buttonWidth = 62,
    buttonHeight = 70;
  if (visible) {
    for (const compact of [false, true]) {
      const w = compact ? 48 : 62,
        h = compact ? 58 : 70;
      const candidates: Array<RadialPoint & { angle: number; distance: number }> = [];
      for (const extra of [0, 24, 48, 80, 120, 170, 230]) {
        for (let i = 0; i < 48; i++) {
          const angle = (i * Math.PI) / 24;
          const dx = Math.cos(angle),
            dy = Math.sin(angle);
          const reachX =
            ((object.right - object.left) / 2 + w / 2 + 12) / Math.max(0.0001, Math.abs(dx));
          const reachY =
            ((object.top - object.bottom) / 2 + h / 2 + 12) / Math.max(0.0001, Math.abs(dy));
          const distance = Math.min(reachX, reachY) + extra;
          const point = {
            x: center.x + dx * distance,
            y: center.y + dy * distance,
            angle,
            distance,
          };
          if (clear(pointRect(point, w, h), obstacles)) candidates.push(point);
        }
      }
      let bestScore = Infinity;
      for (const phase of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const positions: RadialPoint[] = [],
          occupied = [...obstacles];
        let score = 0;
        for (let i = 0; i < wanted; i++) {
          const ideal =
            wanted <= 4
              ? Math.PI / 2 + phase + (((wanted - 1) / 2 - i) * Math.PI) / 4
              : (Math.PI * 3) / 4 - (i * Math.PI * 2) / wanted;
          const ranked = candidates
            .map((point) => ({
              point,
              score: point.distance + 160 * Math.acos(Math.cos(point.angle - ideal)),
            }))
            .sort((a, b) => a.score - b.score);
          const chosen = ranked.find(({ point }) => clear(pointRect(point, w, h), occupied));
          if (!chosen) break;
          positions.push(chosen.point);
          occupied.push(pointRect(chosen.point, w, h));
          score += chosen.score;
        }
        if (
          positions.length > best.length ||
          (positions.length === best.length && score < bestScore)
        ) {
          best = positions;
          bestScore = score;
          buttonWidth = w;
          buttonHeight = h;
        }
        if (positions.length === wanted && phase === 0) break;
      }
      if (best.length === wanted) break;
    }
  }
  const occupied = [...obstacles, ...best.map((p) => pointRect(p, buttonWidth, buttonHeight))];
  const headingWidth = Math.min(240, Math.max(140, width - 160));
  let heading: RadialPoint | null = null;
  for (const p of [
    { x: center.x, y: object.bottom - 30 },
    { x: center.x, y: object.top + 30 },
    { x: center.x, y: Math.max(object.top + 32, ...best.map((p) => p.y + buttonHeight / 2 + 24)) },
  ]) {
    const adjusted = {
      x: Math.max(safe.left + headingWidth / 2, Math.min(safe.right - headingWidth / 2, p.x)),
      y: p.y,
    };
    if (clear(pointRect(adjusted, headingWidth, 32), occupied)) {
      heading = adjusted;
      break;
    }
  }
  return { positions: best, buttonWidth, buttonHeight, heading, headingWidth, visible };
}
