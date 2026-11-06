import type { Graphics } from 'cc';
import { color } from './Palette';

/** Dry-soil silhouette only while its ImageGen texture loads or if loading fails. */
export function drawSoilIcon(g: Graphics, size: number, enabled = true): void {
  const scale = size / 40;
  const face = (shade: string, points: Array<[number, number]>) => {
    const fill = color(shade);
    if (!enabled) fill.a = 175;
    g.fillColor = fill;
    points.forEach(([x, y], index) =>
      index ? g.lineTo(x * scale, y * scale) : g.moveTo(x * scale, y * scale),
    );
    g.close();
    g.fill();
  };
  g.clear();
  face('#B66F3D', [
    [-17, 6],
    [0, -2],
    [0, -18],
    [-17, -9],
  ]);
  face('#92552F', [
    [0, -2],
    [17, 6],
    [17, -9],
    [0, -18],
  ]);
  face('#D89C5E', [
    [-17, 6],
    [0, 16],
    [17, 6],
    [0, -2],
  ]);
  for (const [x, y, radius] of [
    [-8, 5, 1.4],
    [5, 8, 1.7],
    [-9, -7, 1.1],
    [7, -7, 1.3],
  ]) {
    g.fillColor = color(enabled ? '#875033' : '#875033AF');
    g.circle(x! * scale, y! * scale, radius! * scale);
    g.fill();
  }
}
