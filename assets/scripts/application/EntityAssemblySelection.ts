import { entityAssemblyPlan } from '../domain/game';
import type { Command, EntitySnapshot, GameState } from '../domain/game';
/** A single hammer gesture owns explicit entity snapshots. Stale sources stay invalid until reset. */
export class EntityAssemblySelection {
  private sources: EntitySnapshot[] = [];
  invalid = false;
  get selected(): readonly EntitySnapshot[] {
    return this.sources;
  }
  observe(state: GameState, id?: string): void {
    this.invalid ||= this.sources.some(
      (s) =>
        !state.buildings.some(
          (b) =>
            b.id === s.id &&
            b.kind === s.kind &&
            b.x === s.x &&
            b.z === s.z &&
            b.rotation === s.rotation,
        ),
    );
    if (this.invalid || !id || this.sources.length >= 3 || this.sources.some((s) => s.id === id))
      return;
    if (this.sources.length === 2 && this.plan(state)) return;
    const b = state.buildings.find((b) => b.id === id);
    if (b) this.sources.push({ id: b.id, kind: b.kind, x: b.x, z: b.z, rotation: b.rotation });
  }
  plan(state: GameState) {
    if (this.invalid) return null;
    try {
      return entityAssemblyPlan(state, this.sources);
    } catch {
      return null;
    }
  }
  command(): Command | null {
    return !this.invalid && this.sources.length >= 2
      ? { type: 'hammerAssembly', tool: 'hammer', sources: this.sources.map((s) => ({ ...s })) }
      : null;
  }
  clear(): void {
    this.sources = [];
    this.invalid = false;
  }
}
