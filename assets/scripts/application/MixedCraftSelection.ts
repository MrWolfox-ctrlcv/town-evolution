import type { Command, GameState, GroundStack, LandCell } from '../domain/game';
/** Gesture-owned exact snapshots. Sources are never guessed, replaced or taken from inventory. */
export class MixedCraftSelection {
  private sources: GroundStack[] = [];
  invalid = false;
  get complete(): boolean {
    return this.sources.length === 2;
  }
  get selected(): readonly GroundStack[] {
    return this.sources;
  }
  observe(state: GameState, point?: LandCell): void {
    this.invalid ||= this.sources.some(
      (source) =>
        !state.groundStacks.some(
          (pile) =>
            pile.x === source.x &&
            pile.z === source.z &&
            pile.item === source.item &&
            pile.amount === source.amount,
        ),
    );
    if (this.invalid || !point || this.complete) return;
    const pile = state.groundStacks.find((p) => p.x === point.x && p.z === point.z);
    if (
      !pile ||
      !['wood', 'stone'].includes(pile.item) ||
      this.sources.some((source) => source.item === pile.item)
    )
      return;
    this.sources.push({ ...pile });
  }
  command(x: number, z: number): Command | null {
    return this.complete && !this.invalid
      ? {
          type: 'craftMixed',
          recipeId: 'build-stone-oven',
          tool: 'hammer',
          sources: this.sources.map((source) => ({ ...source })),
          x,
          z,
        }
      : null;
  }
  clear(): void {
    this.sources = [];
    this.invalid = false;
  }
}
