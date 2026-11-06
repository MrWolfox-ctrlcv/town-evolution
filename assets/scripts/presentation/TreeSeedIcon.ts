import type { Graphics } from 'cc';
import { color } from './Palette';

/** Acorn seeds share the same warm wood colors as the collectible ground piles. */
export function drawTreeSeedIcon(g: Graphics, size: number, enabled = true): void {
  const scale = size / 40;
  const fill = (hex: string) => {
    const shade = color(hex);
    if (!enabled) shade.a = 175;
    g.fillColor = shade;
  };
  g.clear();
  for (const [x, y] of [
    [-9, -3],
    [9, 5],
  ]) {
    fill('#C99349');
    g.ellipse(x! * scale, (y! - 3) * scale, 8 * scale, 11 * scale);
    g.fill();
    fill('#E6BD76');
    g.ellipse((x! - 2) * scale, (y! - 4) * scale, 2.5 * scale, 7 * scale);
    g.fill();
    fill('#835638');
    g.roundRect((x! - 9) * scale, (y! + 3) * scale, 18 * scale, 6 * scale, 3 * scale);
    g.fill();
    fill('#67452E');
    g.roundRect((x! - 1.5) * scale, (y! + 8) * scale, 3 * scale, 5 * scale, scale);
    g.fill();
  }
}
