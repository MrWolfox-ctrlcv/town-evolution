import type { Graphics } from 'cc';
import { color } from './Palette';
/** A low, wet clay block; distinct from the tall dry-soil icon. */
export function drawMudIcon(g: Graphics, size: number, enabled = true): void {
  const scale = size / 40;
  g.clear();
  const face = (shade: string, points: Array<[number, number]>) => {
    const fill = color(shade);
    if (!enabled) fill.a = 175;
    g.fillColor = fill;
    points.forEach(([x, y], i) =>
      i ? g.lineTo(x * scale, y * scale) : g.moveTo(x * scale, y * scale),
    );
    g.close();
    g.fill();
  };
  face('#74563E', [
    [-18, 3],
    [0, -5],
    [0, -13],
    [-18, -5],
  ]);
  face('#584A3C', [
    [0, -5],
    [18, 3],
    [18, -5],
    [0, -13],
  ]);
  face('#92775C', [
    [-18, 3],
    [0, 13],
    [18, 3],
    [0, -5],
  ]);
  face('#A6B6AE', [
    [-7, 4],
    [1, 8],
    [8, 5],
    [0, 2],
  ]);
}
