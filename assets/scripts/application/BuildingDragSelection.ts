import type { Building, EntitySnapshot, GameState } from '../domain/game';
const snapshot = ({ id, kind, x, z, rotation }: Building): EntitySnapshot => ({
  id,
  kind,
  x,
  z,
  rotation,
});
const matches = (b: Building | undefined, s: EntitySnapshot) =>
  !!b &&
  b.id === s.id &&
  b.kind === s.kind &&
  b.x === s.x &&
  b.z === s.z &&
  b.rotation === s.rotation;
/** Exact long-press sources. Once observed changed, a gesture cannot re-arm itself. */
export class BuildingDragSelection {
  private source: EntitySnapshot | null = null;
  private target: EntitySnapshot | null = null;
  private invalid = false;
  begin(b: Building): void {
    this.source = snapshot(b);
    this.target = null;
    this.invalid = false;
  }
  get sourceId(): string | null {
    return this.source?.id ?? null;
  }
  get hasTarget(): boolean {
    return this.target !== null;
  }
  check(state: GameState): boolean {
    if (
      !this.source ||
      !matches(
        state.buildings.find((b) => b.id === this.source!.id),
        this.source,
      ) ||
      (this.target &&
        !matches(
          state.buildings.find((b) => b.id === this.target!.id),
          this.target,
        ))
    )
      this.invalid = true;
    return !this.invalid;
  }
  pair(state: GameState, target: Building): [EntitySnapshot, EntitySnapshot] | null {
    if (!this.check(state) || this.source?.kind !== 'woodenPier' || target.kind !== 'woodenPier')
      return null;
    if (!this.target) this.target = snapshot(target);
    if (target.id !== this.target.id) return null;
    return [{ ...this.source }, { ...this.target }];
  }
  movement(state: GameState): EntitySnapshot | null {
    return this.check(state) && this.source ? { ...this.source } : null;
  }
  clear(): void {
    this.source = this.target = null;
    this.invalid = false;
  }
}
