import type { Command, GameState, Crop } from '../domain/game';
export type FarmTool = 'plant' | 'harvest';
/** Each cell is attempted once per gesture, including rejected/full-storage attempts. */
export class FarmSweep {
  private visited = new Set<string>();
  private tool: FarmTool | null = null;
  private crop: Crop = 'vegetable';
  begin(tool: FarmTool, crop: Crop = 'vegetable'): void {
    this.crop = crop;
    this.tool = tool;
    this.visited.clear();
  }
  command(state: GameState, buildingId: string | null, cell: number): Command | null {
    if (!this.tool || !buildingId || !Number.isInteger(cell) || cell < 0 || cell > 8) return null;
    const key = `${buildingId}:${cell}`;
    if (this.visited.has(key)) return null;
    const b = state.buildings.find((item) => item.id === buildingId);
    if (!b || b.kind !== 'farm') return null;
    this.visited.add(key);
    return this.tool === 'plant'
      ? { type: 'plantCell', buildingId, cell, crop: this.crop }
      : { type: 'harvestCell', buildingId, cell };
  }
  cancel(): void {
    this.tool = null;
    this.visited.clear();
  }
}
