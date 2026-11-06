import { Node, Label, UITransform } from 'cc';
import { label, panel, uiNode, ActionButton } from './Widgets';
import { HandbookArt } from './HandbookArt';
import { HandbookDiagram } from './HandbookDiagram';
import { RECIPE_PAPER } from '../application/HandbookLayout';
import { color } from './Palette';
import type { GameState } from '../domain/game';
import { HANDBOOK_PAGE_SIZE, handbookView } from '../application/HandbookModel';

/** Illustrated recipes; discovery alone reveals the ingredients and result. */
export class HandbookPages {
  private state: GameState | null = null;
  private selected = 0;
  private directoryPage = 0;
  private readonly directoryPageLabel: Label;
  private readonly diagram: Node;
  private readonly drawings: HandbookDiagram;
  private readonly progress: Label;
  private readonly rows: Node[] = [];
  private readonly detailPage: Label;
  private key = '';
  constructor(
    directory: Node,
    paper: Node,
    content: Node,
    private readonly art: HandbookArt,
    private readonly buttons: ActionButton[],
    private readonly open: () => void,
  ) {
    this.drawings = new HandbookDiagram(art);
    panel(directory, RECIPE_PAPER.width, RECIPE_PAPER.height, '#255C54', 12);
    const lining = uiNode('FolderLining', directory);
    panel(lining, RECIPE_PAPER.width - 12, RECIPE_PAPER.height - 12, '#E2CAA0', 9);
    this.progress = this.text(directory, '', 0, 133, 140, 20);
    this.progress.node.name = 'RecipeDiscoveryProgress';
    for (let index = 0; index < HANDBOOK_PAGE_SIZE; index++) {
      const button = this.button(
        directory,
        `RecipeCategory-${index}`,
        '',
        0,
        80 - index * 64,
        254,
        () => {
          this.selected = this.directoryPage * HANDBOOK_PAGE_SIZE + index;
          this.refresh(true);
          this.open();
        },
      );
      button.node.getComponent(UITransform)!.setContentSize(254, 56);
      this.art.tab(button.node, 254);
      this.rows.push(uiNode('RecipeEquation', button.node));
    }
    this.button(directory, 'RecipeDirectoryPrevious', '‹', -86, -155, 40, () =>
      this.turnDirectory(-1),
    );
    this.button(directory, 'RecipeDirectoryNext', '›', 86, -155, 40, () => this.turnDirectory(1));
    this.directoryPageLabel = this.text(directory, '', 0, -155, 72, 12);
    this.button(paper, 'RecipePrevious', '‹', -68, 140, 40, () => this.turnRecipe(-1));
    this.button(paper, 'RecipeNext', '›', 68, 140, 40, () => this.turnRecipe(1));
    this.diagram = uiNode('RecipeDiagram', content);
    this.detailPage = this.text(paper, '', 0, 140, 72, 12);
  }
  setState(state: GameState): void {
    this.state = state;
    this.refresh();
  }
  refresh(force = false): void {
    if (!this.state) return;
    const view = handbookView(this.state, this.selected, this.directoryPage);
    const { entries } = view;
    this.selected = view.selected;
    this.directoryPage = view.directoryPage;
    const key = JSON.stringify([
      this.selected,
      this.directoryPage,
      entries.map((entry) => entry.count),
    ]);
    if (!force && this.key === key) return;
    this.key = key;
    this.progress.string = `✓  ${view.progress} / ${entries.length}`;
    this.rows.forEach((row, index) => {
      this.drawings.clear(row);
      const entry = view.directoryEntries[index];
      row.parent!.active = Boolean(entry);
      if (!entry) return;
      row.parent!.name = `RecipeCategory-${entry.recipe.id}`;
      this.drawings.equation(row, entry.discovered ? entry.recipe : null);
    });
    this.directoryPageLabel.string = `${this.directoryPage + 1} / ${view.directoryPageCount}`;
    this.drawings.clear(this.diagram);
    const entry = view.detail;
    this.drawings.detail(this.diagram, entry?.discovered ? entry.recipe : null, entry?.count ?? 0);
    this.detailPage.string = `${this.selected + 1} / ${entries.length}`;
  }
  private turnDirectory(delta: number): void {
    this.directoryPage += delta;
    this.refresh(true);
  }
  private turnRecipe(delta: number): void {
    this.selected += delta;
    this.refresh(true);
  }
  private text(
    parent: Node,
    text: string,
    x: number,
    y: number,
    width: number,
    size: number,
  ): Label {
    const value = label(parent, text, size);
    value.node.setPosition(x, y);
    value.node.getComponent(UITransform)!.setContentSize(width, 28);
    value.horizontalAlign = Label.HorizontalAlign.CENTER;
    value.color = color('#294F45');
    return value;
  }
  private button(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    run: () => void,
  ): ActionButton {
    const button = new ActionButton(parent, () => {});
    button.node.name = name;
    button.set({ text, run });
    button.layout(x, y, width);
    panel(button.node, width, 40, '#FCEDCC', 5);
    const title = button.node.getComponentInChildren(Label)!;
    title.color = color('#365C52');
    title.fontSize = 14;
    if (name.endsWith('Previous') || name.endsWith('Next'))
      this.art.navigationButton(button.node, name.endsWith('Previous') ? 'previous' : 'next');
    this.buttons.push(button);
    return button;
  }
}
