import { Node, Label, UITransform } from 'cc';
import { uiNode, label, panel } from './Widgets';
import { color } from './Palette';
import { CropArtwork } from './CropArtwork';
import { HandbookSkin } from './HandbookSkin';
import type { Navigation } from './HandbookSkin';
import { RECIPE_PAPER } from '../application/HandbookLayout';
import { acquireModelThumbnails } from './ModelThumbnails';
import { HANDBOOK_MODELS, HANDBOOK_TOOLS } from '../art/HandbookAssets';
/** Recipe pictures are captures of the actual town meshes and the live tool tray's images. */
export class HandbookArt {
  private readonly skin = new HandbookSkin();
  private readonly navigation = new HandbookSkin(true);
  private thumbnails: ReturnType<typeof acquireModelThumbnails> | null = null;
  private readonly images = new Map(
    Object.entries(HANDBOOK_TOOLS).map(([kind, icon]) => [kind, new CropArtwork(icon)]),
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
    if (HANDBOOK_MODELS[kind]) {
      const loading = label(node, '…', 16);
      loading.node.name = 'ThumbnailLoading';
      loading.horizontalAlign = Label.HorizontalAlign.CENTER;
      loading.node.getComponent(UITransform)!.setContentSize(54, 54);
      (this.thumbnails ??= acquireModelThumbnails()).value.bind(node, kind, 64);
    } else {
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
    this.thumbnails?.value.clear(node);
    this.images.forEach((image) => image.clear(node));
  }
  dispose(): void {
    this.skin.dispose();
    this.navigation.dispose();
    this.thumbnails?.release();
    this.thumbnails = null;
    this.images.forEach((image) => image.dispose());
  }
}
