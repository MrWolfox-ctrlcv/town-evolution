import type { GameState } from '../domain/types';
import { footprint } from '../domain/geometry';
import { v6Plane, type V6SurfaceSource } from './V6SurfaceContracts';
/** Conservative metadata bounds, never a mesh or sampling-based approximation. */
export class V6CandidateBounds {
  private readonly cache = new Map<string, number>();
  private readonly occupied = new Set<string>();
  constructor(
    private readonly source: V6SurfaceSource,
    state: GameState,
  ) {
    const add = (x: number, z: number) =>
      this.occupied.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
    // Keep object-bearing chunks conservatively until canonical object bounds are available.
    for (const stack of state.groundStacks) add(stack.x, stack.z);
    for (const tree of state.trees) add(tree.x, tree.z);
    for (const building of state.buildings) {
      const size = footprint(building);
      for (let z = building.z; z < building.z + size.depth; z++)
        for (let x = building.x; x < building.x + size.width; x++) add(x, z);
    }
  }
  get(
    key: string,
  ): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null {
    if (this.occupied.has(key) || !this.source.world.cellUpperBound) return null;
    const [cx, cz] = key.split(',').map(Number);
    if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null;
    let top = this.cache.get(key);
    if (top === undefined) {
      // Natural coast only lowers the base 0.015 plane. Include adjacent owners for cut walls.
      top = Math.fround(0.015);
      for (let z = cz! * 16 - 1; z <= (cz! + 1) * 16; z++)
        for (let x = cx! * 16 - 1; x <= (cx! + 1) * 16; x++) {
          top = Math.max(top, this.source.world.cellUpperBound(x, z));
          const edit = this.source.editAt(x, z);
          if (edit)
            top = Math.max(top, v6Plane(edit.level), ...edit.fills.map((f) => v6Plane(f.level)));
        }
      this.cache.set(key, top);
    }
    if (!Number.isFinite(top)) return null;
    return {
      min: { x: cx! * 16 - 0.001, y: -4, z: cz! * 16 - 0.001 },
      max: { x: (cx! + 1) * 16 + 0.001, y: top + 0.25, z: (cz! + 1) * 16 + 0.001 },
    };
  }
}
