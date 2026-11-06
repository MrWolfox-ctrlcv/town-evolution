import { COMPOST_ITEMS, COMPOST_BALANCE } from '../domain/game';
import { Node, Graphics } from 'cc';
import { uiNode, panel } from './Widgets';
import { HandbookArt } from './HandbookArt';
import { color } from './Palette';
import type { RecipeDefinition } from '../domain/recipes';

/** Numeric badges and operators are the only lettering on recipe illustrations. */
export class HandbookDiagram {
  constructor(private readonly art: HandbookArt) {}
  equation(parent: Node, recipe: RecipeDefinition | null): void {
    if (!recipe) {
      this.art.caption(parent, '?   +   ?   =   ?', 0, 0, 230, 24);
      return;
    }
    if (recipe.id === 'make-fertilizer') {
      this.compostChoices(parent, -54, 2, 0.6);
      this.art.caption(parent, '=', 37, 0, 22, 21);
      this.item(parent, recipe.result.kind, recipe.result.amount, 90, 2, 0.66);
      return;
    }
    const parts = [
      ...recipe.ingredients,
      ...(recipe.tool ? [{ kind: recipe.tool, amount: 1 }] : []),
      recipe.result,
      ...(recipe.byproducts ?? []),
    ];
    const step = Math.min(82, 244 / Math.max(1, parts.length - 1));
    const ingredientCount = recipe.ingredients.length + (recipe.tool ? 1 : 0);
    parts.forEach((part, i) => {
      const x = (i - (parts.length - 1) / 2) * step;
      this.item(parent, part.kind, part.amount, x, 2, 0.66);
      if (i < parts.length - 1)
        this.art.caption(parent, i === ingredientCount - 1 ? '=' : '+', x + step / 2, 0, 22, 21);
    });
  }
  detail(parent: Node, recipe: RecipeDefinition | null, count: number): void {
    if (!recipe) {
      const lock = uiNode('RecipeUnknown', parent);
      const g = lock.addComponent(Graphics);
      g.strokeColor = color('#8C764B');
      g.lineWidth = 7;
      g.roundRect(-20, 5, 40, 40, 18);
      g.stroke();
      g.fillColor = color('#D7B36D');
      g.roundRect(-35, -40, 70, 58, 9);
      g.fill();
      this.art.caption(lock, '?', 0, -11, 40, 28);
      this.art.caption(parent, '?  +  ?  =  ?', 0, -87, 240, 22);
      return;
    }
    if (recipe.id === 'make-fertilizer') this.compostChoices(parent, 0, 78, 1);
    else
      recipe.ingredients.forEach((ingredient, i) => {
        const x = (i - (recipe.ingredients.length - 1) / 2) * 110;
        this.item(parent, ingredient.kind, ingredient.amount, x, 78, 1.02);
        if (i < recipe.ingredients.length - 1) this.art.caption(parent, '+', x + 55, 78, 24, 26);
      });
    const arrow = uiNode('RecipeFlow', parent);
    const g = arrow.addComponent(Graphics);
    g.strokeColor = color('#366858');
    g.lineWidth = 4;
    g.moveTo(0, 29);
    g.lineTo(0, -29);
    g.moveTo(-10, -19);
    g.lineTo(0, -29);
    g.lineTo(10, -19);
    g.stroke();
    if (recipe.tool) this.item(parent, recipe.tool, 1, 57, 0, 0.92);
    const products = [recipe.result, ...(recipe.byproducts ?? [])];
    products.forEach((product, i) => {
      const x = (i - (products.length - 1) / 2) * 122;
      this.item(parent, product.kind, product.amount, x, -84, products.length > 1 ? 1.05 : 1.3);
      if (i < products.length - 1) this.art.caption(parent, '+', x + 61, -84, 24, 26);
    });
    this.art.caption(parent, `✓ ×${count}`, 0, -140, 160, 16);
  }
  private compostChoices(parent: Node, x: number, y: number, scale: number): void {
    const pool = uiNode('CompostInputChoices', parent);
    pool.setPosition(x, y);
    panel(pool, 226 * scale, 66 * scale, '#FCEDCC', 5);
    COMPOST_ITEMS.forEach((kind, i) => {
      this.item(pool, kind, 1, (i - 2) * 44 * scale, 4 * scale, 0.52 * scale);
      if (i < COMPOST_ITEMS.length - 1)
        this.art.caption(pool, '/', (i - 1.5) * 44 * scale, 4 * scale, 12, 16 * scale);
    });
    this.art.caption(pool, `×${COMPOST_BALANCE.inputAmount}`, 0, -23 * scale, 50, 16 * scale);
  }
  private item(
    parent: Node,
    kind: string,
    amount: number,
    x: number,
    y: number,
    scale: number,
  ): void {
    const slot = uiNode(`RecipeItem-${kind}`, parent);
    slot.setPosition(x, y);
    const icon = uiNode('Illustration', slot);
    icon.setScale(scale, scale, 1);
    this.art.icon(icon, kind, 0, 0);
    if (amount > 1) {
      const badge = uiNode('RecipeQuantity', slot);
      badge.setPosition(18 * scale, -20 * scale);
      panel(badge, 28, 18, '#FFF6DC', 6);
      this.art.caption(badge, `×${amount}`, 0, 0, 28, 13);
    }
  }
  clear(parent: Node): void {
    const release = (node: Node) => {
      this.art.clear(node);
      node.children.forEach(release);
    };
    for (const child of [...parent.children]) {
      release(child);
      child.removeFromParent();
      child.destroy();
    }
  }
}
