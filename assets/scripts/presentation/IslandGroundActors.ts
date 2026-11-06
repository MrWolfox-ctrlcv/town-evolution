import { dropRect } from '../application/DropGeometry';
import { farmBoxCell } from '../domain/game';
import type { GameState } from '../domain/types';
import { footprint } from '../domain/geometry';
import type { GroundActor } from '../art/SceneGroundArt';
export function islandGroundActors(
  state: GameState,
  boxRects: readonly { x: number; z: number; width: number; depth: number }[],
  dropRects: readonly { x: number; z: number; width: number; depth: number }[],
): GroundActor[] {
  return [
    ...boxRects.map((p) => ({ ...p, tree: false, resource: true, rotation: 0 })),
    ...dropRects.map((p) => ({ ...p, tree: false, prop: true, rotation: 0 })),
    ...state.groundStacks.map((p) => ({
      x: p.x,
      z: p.z,
      width: 1,
      depth: 1,
      tree: false,
      prop: true,
      rotation: 0,
    })),
    ...state.buildings.map((b) => ({
      x: b.x,
      z: b.z,
      ...footprint(b),
      rotation: b.rotation,
      tree: false,
    })),
    ...state.trees.map((t) => ({ x: t.x, z: t.z, width: 1, depth: 1, rotation: 0, tree: true })),
    ...state.naturalResources.map((r) => ({
      x: r.x,
      z: r.z,
      width: 1,
      depth: 1,
      rotation: 0,
      tree: false,
      resource: true,
    })),
  ];
}

/** Exact legacy coast protection inputs, extracted without changing their order. */
export function islandGroundLayout(state: GameState) {
  const buildings = state.buildings.map((b) => [
    b.kind,
    b.x,
    b.z,
    b.rotation,
    b.farmSize,
    footprint(b),
  ]);
  const boxRects = state.buildings.flatMap((b) => {
    const p = farmBoxCell(b);
    return p ? [{ ...p, width: 1, depth: 1 }] : [];
  });
  const dropRects = (state.looseDrops ?? []).map(dropRect);
  const protectedRects = [
    ...state.buildings.map((b) => ({ x: b.x, z: b.z, ...footprint(b) })),
    ...boxRects,
    ...dropRects,
  ];
  return { buildings, boxRects, dropRects, protectedRects };
}
