import type { Graphics } from 'cc';
import { color } from './Palette';
import { drawSoilIcon } from './SoilIcon';
import { drawTreeSeedIcon } from './TreeSeedIcon';

/** Small inventory/building silhouettes used in the recipe handbook. */
export function drawRecipeMaterial(g: Graphics, kind: string): boolean {
  if (kind === 'soil' || kind === 'soilHill') {
    drawSoilIcon(g, 54);
    return true;
  }
  if (['flatLand', 'farm', 'largeFarm', 'waterFarm'].includes(kind)) {
    const wet = kind === 'waterFarm',
      flat = kind === 'flatLand';
    g.fillColor = color(flat ? '#8DA85A' : wet ? '#659F9D' : '#765035');
    g.roundRect(-27, -23, 54, 46, 4);
    g.fill();
    g.strokeColor = color(flat ? '#B4C96C' : wet ? '#A6CFCA' : '#AA7A4E');
    g.lineWidth = 2;
    const rows = kind === 'largeFarm' ? 6 : 3;
    for (let i = 0; i < rows; i++) {
      const y = -18 + (i * 36) / Math.max(1, rows - 1);
      g.moveTo(-23, y);
      g.lineTo(23, y);
      g.stroke();
    }
    return true;
  }
  if (kind === 'treeSeed') {
    drawTreeSeedIcon(g, 54);
    return true;
  }
  if (kind === 'crate') {
    g.fillColor = color('#B7834E');
    g.roundRect(-24, -21, 48, 43, 3);
    g.fill();
    g.strokeColor = color('#72492E');
    g.lineWidth = 3;
    for (const y of [-10, 1, 12]) {
      g.moveTo(-23, y);
      g.lineTo(23, y);
      g.stroke();
    }
    g.strokeColor = color('#E4BA7E');
    g.lineWidth = 6;
    g.moveTo(-21, -17);
    g.lineTo(21, 18);
    g.moveTo(-21, 18);
    g.lineTo(21, -17);
    g.stroke();
    return true;
  }
  if (kind === 'orderBoard') {
    g.fillColor = color('#8B5A36');
    g.rect(-18, -26, 6, 53);
    g.rect(12, -26, 6, 53);
    g.fill();
    g.fillColor = color('#C3935E');
    g.roundRect(-27, -6, 54, 36, 3);
    g.fill();
    for (const x of [-17, 3]) {
      g.fillColor = color('#F6E2AF');
      g.rect(x, 0, 14, 22);
      g.fill();
    }
    return true;
  }
  return false;
}
