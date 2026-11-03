import { Node, Graphics, Label, UITransform } from 'cc';
import { uiNode, label, panel } from './Widgets';
import { color } from './Palette';
import { CropArtwork } from './CropArtwork';
import { HandbookSkin } from './HandbookSkin';
import type { Navigation } from './HandbookSkin';
import { RECIPE_PAPER } from '../application/HandbookLayout';
/** Parchment illustrations share the tray's art; faceted tree/house match the town palette. */
export class HandbookArt {
  private readonly skin = new HandbookSkin();
  private readonly navigation = new HandbookSkin(true);
  private readonly images = new Map(
    ['axe', 'saw', 'wood', 'hammer'].map((id) => [id, new CropArtwork(id)]),
  );
  caption(parent: Node, text: string, x: number, y: number, width: number, size = 14): void {
    const value = label(parent, text, size);
    value.horizontalAlign = Label.HorizontalAlign.CENTER;
    value.node.setPosition(x, y);
    value.node.getComponent(UITransform)!.setContentSize(width, Math.max(24, size * 1.4));
    value.color = color('#294F45');
  }
  icon(parent: Node, kind: string, x: number, y: number): void {
    const node = uiNode(`Recipe-${kind}`, parent);
    node.setPosition(x, y);
    const g = node.addComponent(Graphics);
    const polygon = (fill: string, points: number[][]) => {
      g.fillColor = color(fill);
      g.moveTo(points[0]![0]!, points[0]![1]!);
      for (const p of points.slice(1)) g.lineTo(p[0]!, p[1]!);
      g.close();
      g.fill();
    };
    if (kind === 'tree') {
      polygon('#97713D', [
        [-6, -22],
        [5, -20],
        [6, 12],
        [-4, 14],
      ]);
      polygon('#C29C62', [
        [-6, -22],
        [-1, -20],
        [1, 11],
        [-4, 14],
      ]);
      polygon('#79943A', [
        [-25, 4],
        [-20, 23],
        [-5, 33],
        [14, 29],
        [24, 13],
        [18, -4],
        [2, -10],
        [-17, -6],
      ]);
      polygon('#D5D969', [
        [-20, 23],
        [-5, 33],
        [4, 15],
        [-9, 8],
        [-25, 4],
      ]);
      polygon('#AFBE4E', [
        [-5, 33],
        [14, 29],
        [24, 13],
        [4, 15],
      ]);
      polygon('#98AC42', [
        [4, 15],
        [24, 13],
        [18, -4],
        [2, -10],
        [-9, 8],
      ]);
      polygon('#B6C758', [
        [-25, 4],
        [-9, 8],
        [2, -10],
        [-17, -6],
      ]);
    } else if (['warehouse', 'expandedWarehouse', 'coldWarehouse'].includes(kind)) {
      polygon('#B8A47C', [
        [-26, -20],
        [0, -28],
        [28, -15],
        [0, -7],
      ]);
      polygon('#E7CB94', [
        [-22, -16],
        [-22, 12],
        [4, 21],
        [4, -23],
      ]);
      polygon('#F7E6BF', [
        [4, -23],
        [4, 21],
        [25, 11],
        [25, -15],
      ]);
      polygon('#9C5932', [
        [-27, 11],
        [-4, 32],
        [8, 26],
        [-17, 5],
      ]);
      polygon('#DD8650', [
        [-17, 5],
        [8, 26],
        [29, 13],
        [4, -9],
      ]);
      polygon('#B86536', [
        [4, -9],
        [29, 13],
        [29, 9],
        [4, -13],
      ]);
      polygon('#32756B', [
        [9, -21],
        [9, -2],
        [20, 3],
        [20, -17],
      ]);
      g.strokeColor = color('#85A690');
      g.lineWidth = 1;
      g.moveTo(14, -19);
      g.lineTo(14, 0);
      g.stroke();
      polygon('#3B7C70', [
        [-16, -6],
        [-16, 2],
        [-9, 5],
        [-9, -3],
      ]);
      g.strokeColor = color('#E7A875');
      for (let i = 0; i < 3; i++) {
        g.moveTo(-10 + i * 6, 10 + i * 5);
        g.lineTo(9 + i * 6, -1 + i * 5);
        g.stroke();
      }
      if (kind !== 'warehouse') {
        polygon(kind === 'coldWarehouse' ? '#B7E0DC' : '#E6BD7A', [
          [-29, -20],
          [-29, 0],
          [-13, 6],
          [-2, -2],
          [-2, -28],
        ]);
        polygon(kind === 'coldWarehouse' ? '#6DA8AF' : '#C36C38', [
          [-33, 0],
          [-17, 13],
          [2, 1],
          [-14, -11],
        ]);
        if (kind === 'coldWarehouse') {
          g.strokeColor = color('#FFFFFF');
          g.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const a = (i * Math.PI) / 3;
            g.moveTo(-16 - Math.cos(a) * 7, -15 - Math.sin(a) * 7);
            g.lineTo(-16 + Math.cos(a) * 7, -15 + Math.sin(a) * 7);
            g.stroke();
          }
        }
      }
    } else if (kind === 'cooler') {
      polygon('#7FACA8', [
        [-23, -22],
        [-23, 25],
        [4, 32],
        [4, -17],
      ]);
      polygon('#C9E5DF', [
        [4, -17],
        [4, 32],
        [25, 24],
        [25, -25],
      ]);
      polygon('#ECF4DA', [
        [-23, 25],
        [4, 32],
        [25, 24],
        [-3, 17],
      ]);
      g.strokeColor = color('#507D79');
      g.lineWidth = 2;
      g.moveTo(-21, 2);
      g.lineTo(3, 9);
      g.stroke();
      g.moveTo(-3, 16);
      g.lineTo(-3, 8);
      g.stroke();
      g.moveTo(-3, -2);
      g.lineTo(-3, -11);
      g.stroke();
    } else {
      g.fillColor = color('#B98B55');
      g.roundRect(-17, -9, 34, 18, 5);
      g.fill();
      this.images.get(kind)?.bind(node, 54);
    }
  }
  folder(parent: Node): void {
    const node = uiNode('PocketFolderArtwork', parent);
    panel(node, 54, 62, '#33796E', 8);
    this.skin.bind(node, 'cover', 54, 64);
    for (const child of node.children) {
      const text = child.getComponent(Label);
      if (text) text.color = color('#FFF2D3');
    }
  }
  paper(parent: Node): void {
    panel(parent, RECIPE_PAPER.width, RECIPE_PAPER.height, '#FFF0CE', 8);
    this.skin.bind(parent, 'paper', RECIPE_PAPER.width, RECIPE_PAPER.height);
  }
  directory(parent: Node): void {
    this.skin.bind(parent, 'directory', RECIPE_PAPER.width, RECIPE_PAPER.height);
  }
  tab(parent: Node, width: number): void {
    this.skin.bind(parent, 'tab', width + 8, 52);
  }
  navigationButton(node: Node, kind: Navigation): void {
    this.navigation.bind(node, kind, 38, 38);
  }
  clear(node: Node): void {
    this.images.forEach((image) => image.clear(node));
  }
  dispose(): void {
    this.skin.dispose();
    this.navigation.dispose();
    this.images.forEach((image) => image.dispose());
  }
}
