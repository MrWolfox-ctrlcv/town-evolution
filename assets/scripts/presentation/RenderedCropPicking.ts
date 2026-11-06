import type { Node } from 'cc';

/** Resolve a rendered hit's crop identity without repeating its triangle query. */
export class RenderedCropPicking {
  private readonly soil = new WeakSet<Node>();
  private readonly cells = new WeakMap<Node, number>();
  constructor(root: Node) {
    const register = (node: Node, cell: number): void => {
      this.cells.set(node, cell);
      for (const child of node.children) register(child, cell);
    };
    const grid = root.getChildByName('FarmGrid');
    const registerSoil = (node: Node): void => {
      this.soil.add(node);
      for (const child of node.children) registerSoil(child);
    };
    const soil = grid?.getChildByName('Soil');
    if (soil) registerSoil(soil);
    for (const node of grid?.children ?? []) {
      const match = /^Cell([0-9]+)$/.exec(node.name);
      const pivot = node.getChildByName('CropSoilPivot');
      if (match && pivot) register(pivot, Number(match[1]));
    }
  }
  isSoil(node: Node): boolean {
    return this.soil.has(node);
  }
  cellAt(node: Node): number | null {
    return this.cells.get(node) ?? null;
  }
}
