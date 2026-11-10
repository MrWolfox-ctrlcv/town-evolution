import { Node, Graphics } from 'cc';
import type { Item, Tool } from '../domain/game';
import { CropArtwork } from './CropArtwork';
import { color } from './Palette';
import { drawSoilIcon } from './SoilIcon';
import { drawMudIcon } from './MudIcon';
import { drawTreeSeedIcon } from './TreeSeedIcon';
export type TrayKind = Tool | Item;
export type TrayAppearance = TrayKind | 'diggingPickaxe' | 'diggingCategory';
export const TRAY_LABELS: Record<TrayKind, string> = {
  sickle: '镰刀',
  wateringCan: '水壶',
  fertilizer: '肥料',
  hammer: '锤子',
  saw: '锯子',
  axe: '斧头',
  diggingTool: '挖掘工具',
  vegetable: '胡萝卜',
  wheat: '小麦',
  lettuce: '生菜',
  rice: '稻谷',
  sapling: '树苗',
  milledRice: '大米',
  flour: '面粉',
  bread: '面包',
  roastedCarrot: '烤胡萝卜',
  wood: '木材',
  stone: '石料',
  soil: '土壤',
  mud: '泥土',
  treeSeed: '树种',
  chilledVegetable: '旧冷藏菜',
};
/** Shared image resources, with readable silhouettes while textures are loading. */
export class TrayIcons {
  private readonly art = new Map<TrayAppearance, CropArtwork>();
  private disposed = false;
  private artwork(kind: TrayAppearance): CropArtwork | undefined {
    if (kind === 'chilledVegetable' || this.disposed) return;
    let art = this.art.get(kind);
    if (!art) {
      const names: Partial<Record<TrayAppearance, string>> = {
        vegetable: 'carrot',
        wateringCan: 'watering-can',
        diggingTool: 'digging-tool',
        treeSeed: 'tree-seed',
        roastedCarrot: 'roasted-carrot',
        milledRice: 'milled-rice',
        diggingPickaxe: 'digging-pickaxe',
        diggingCategory: 'digging-tools',
      };
      art = new CropArtwork(names[kind] ?? kind);
      this.art.set(kind, art);
    }
    return art;
  }
  draw(node: Node, kind: TrayAppearance, size = 40): void {
    if (this.disposed) return;
    const artwork = this.artwork(kind);
    for (const art of this.art.values()) art.clear(node);
    const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    g.clear();
    if (kind === 'mud') {
      drawMudIcon(g, size);
      artwork?.bind(node, size);
      return;
    }
    if (kind === 'soil') {
      drawSoilIcon(g, size);
      artwork?.bind(node, size);
      return;
    }
    if (kind === 'treeSeed') {
      drawTreeSeedIcon(g, size);
      artwork?.bind(node, size);
      return;
    }
    // New goods use generated PNGs only; never substitute an unrelated drawn silhouette.
    if (['rice', 'sapling', 'milledRice', 'flour', 'bread', 'roastedCarrot'].includes(kind)) {
      artwork?.bind(node, size);
      return;
    }
    g.lineWidth = 5;
    g.strokeColor = color('#93623E');
    g.fillColor = color('#95B8B7');
    if (
      [
        'sickle',
        'hammer',
        'saw',
        'axe',
        'diggingTool',
        'diggingPickaxe',
        'diggingCategory',
      ].includes(kind)
    ) {
      g.moveTo(-10, -14);
      g.lineTo(6, 12);
      g.stroke();
      if (kind === 'sickle') {
        g.moveTo(4, 5);
        g.bezierCurveTo(-7, 23, 19, 24, 20, 6);
        g.bezierCurveTo(12, 17, 6, 14, 8, 5);
        g.close();
      } else if (kind === 'hammer') g.rect(-6, 5, 26, 10);
      else if (kind === 'diggingPickaxe') {
        g.moveTo(-12, 19);
        g.lineTo(2, 15);
        g.lineTo(18, 1);
        g.lineTo(14, 15);
        g.lineTo(3, 22);
        g.close();
      } else if (kind === 'diggingTool' || kind === 'diggingCategory') {
        g.moveTo(-8, -4);
        g.lineTo(1, -13);
        g.lineTo(-10, -20);
        g.lineTo(-19, -12);
        g.close();
      } else if (kind === 'axe') {
        g.moveTo(2, 13);
        g.lineTo(20, 15);
        g.lineTo(17, 0);
        g.lineTo(3, 5);
        g.close();
      } else {
        g.moveTo(-12, -5);
        g.lineTo(13, 16);
        g.lineTo(19, 9);
        g.lineTo(-6, -12);
        g.close();
      }
    } else if (kind === 'wateringCan') {
      g.roundRect(-12, -11, 23, 22, 4);
      g.moveTo(8, 0);
      g.lineTo(21, 10);
      g.lineTo(19, 15);
      g.lineTo(5, 6);
      g.close();
    } else if (kind === 'wood') {
      g.fillColor = color('#B88149');
      g.roundRect(-18, -9, 36, 18, 5);
    } else if (kind === 'stone') {
      g.fillColor = color('#9CABA8');
      g.moveTo(-17, -9);
      g.lineTo(-9, 13);
      g.lineTo(10, 16);
      g.lineTo(19, -8);
      g.close();
    } else if (kind === 'fertilizer') {
      g.fillColor = color('#D7C186');
      g.roundRect(-12, -16, 24, 30, 6);
    } else {
      g.fillColor = color(kind === 'vegetable' ? '#E58A42' : '#9ABB68');
      g.circle(0, 0, 14);
    }
    g.fill();
    artwork?.bind(node, size);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const art of this.art.values()) art.dispose();
    this.art.clear();
  }
}
