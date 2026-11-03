import { Node, Graphics, Label, UITransform } from 'cc';
import { uiNode, label, panel } from './Widgets';
import { color } from './Palette';
import { CropArtwork } from './CropArtwork';
import { RECIPE_PAPER } from '../application/HandbookLayout';
/** Parchment illustrations share the tray's art; faceted tree/house match the town palette. */
export class HandbookArt {
  private readonly images = new Map(['axe', 'saw', 'wood'].map((id) => [id, new CropArtwork(id)]));
  caption(parent: Node, text: string, x: number, y: number, width: number, size = 14): void {
    const value = label(parent, text, size);
    value.horizontalAlign = Label.HorizontalAlign.CENTER;
    value.node.setPosition(x, y);
    value.node.getComponent(UITransform)!.setContentSize(width, 24);
    value.color = color('#65543C');
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
    } else if (kind === 'warehouse') {
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
    } else {
      g.fillColor = color('#B98B55');
      g.roundRect(-17, -9, 34, 18, 5);
      g.fill();
      this.images.get(kind)?.bind(node, 54);
    }
  }
  folder(parent: Node): void {
    const node = uiNode('PocketFolderArtwork', parent);
    const g = node.addComponent(Graphics);
    g.fillColor = color('#234F48');
    g.roundRect(-29, -25, 58, 46, 8);
    g.fill();
    g.fillColor = color('#56968A');
    g.roundRect(-28, 12, 27, 17, 5);
    g.fill();
    g.fillColor = color('#D2B985');
    g.roundRect(-24, -18, 48, 40, 4);
    g.fill();
    g.fillColor = color('#FFF2D3');
    g.roundRect(-21, -15, 44, 34, 3);
    g.fill();
    g.fillColor = color('#33796E');
    g.roundRect(-29, -25, 58, 38, 7);
    g.fill();
    g.strokeColor = color('#91B8A1');
    g.lineWidth = 1;
    g.roundRect(-26, -22, 52, 32, 5);
    g.stroke();
    this.caption(node, '配方', 0, -6, 46, 15);
    for (const child of node.children) child.getComponent(Label)!.color = color('#FFF2D3');
  }
  paper(parent: Node): void {
    panel(parent, RECIPE_PAPER.width, RECIPE_PAPER.height, '#C3A16C', 8);
    const face = uiNode('Parchment', parent);
    panel(face, 250, 252, '#FFF0CE', 7);
    const g = face.getComponent(Graphics)!;
    g.strokeColor = color('#CCAD78');
    g.lineWidth = 1;
    g.roundRect(-118, -118, 236, 236, 7);
    g.stroke();
    g.moveTo(-106, 36);
    g.lineTo(106, 36);
    g.stroke();
    g.moveTo(-106, -78);
    g.lineTo(106, -78);
    g.stroke();
    g.fillColor = color('#E5CAA0');
    g.moveTo(99, 126);
    g.lineTo(125, 100);
    g.lineTo(99, 100);
    g.close();
    g.fill();
    const strip = uiNode('RecipeRibbon', parent);
    panel(strip, 80, 20, '#397A6C', 2);
    strip.setPosition(-15, 103);
    this.caption(strip, 'TOWN NOTES', 0, 0, 78, 9);
    strip.children[0]!.getComponent(Label)!.color = color('#FFF2D3');
  }
  clear(node: Node): void {
    this.images.forEach((image) => image.clear(node));
  }
  dispose(): void {
    this.images.forEach((image) => image.dispose());
  }
}
