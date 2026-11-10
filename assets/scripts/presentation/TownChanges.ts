import { farmBoxCell } from '../domain/game';
import { getV6EditSurface } from '../domain/v6-edit-surface';
import { v6TreeRoot } from '../art/V6TreeGeometry';
import type { GameState } from '../domain/game';
import type { SurfacePoint } from '../application/NaturalPicking';
import type { TownFeedback } from './TownFeedback';
/** Committed world changes pulse where they stay, independently of inventory flight effects. */
export function townChanges(
  previous: GameState | null,
  state: GameState,
  feedback: TownFeedback,
  origins:
    | ((id: string) => SurfacePoint | null)
    | {
        dropOrigin(id: string): SurfacePoint | null;
        stackOrigin(x: number, z: number): SurfacePoint | null;
      },
): void {
  if (!previous) return;
  if (previous.mapSeed !== state.mapSeed || previous.terrainVersion !== state.terrainVersion) {
    feedback.clear();
    return;
  }
  const dropOrigin =
    typeof origins === 'function' ? origins : (id: string) => origins.dropOrigin(id);
  const trees = new Set(state.trees.map((tree) => tree.id));
  for (const tree of previous.trees)
    if (!trees.has(tree.id)) {
      if (previous.terrainVersion === 6 || previous.terrainVersion === 7) {
        const surface = getV6EditSurface(previous);
        const root = v6TreeRoot(previous.mapSeed, tree.x, tree.z, (x, z) =>
          surface.heightInCell(x, z, tree.x, tree.z),
        );
        feedback.chop(tree.x, tree.z, previous.mapSeed, true, root);
      } else if (previous.terrainVersion === 5)
        feedback.chop(tree.x, tree.z, previous.mapSeed, true);
      else feedback.chop(tree.x, tree.z, previous.mapSeed);
    }
  for (const pile of state.groundStacks) {
    const old = previous.groundStacks.find(
      (p) => p.x === pile.x && p.z === pile.z && p.item === pile.item,
    );
    if (!old || old.amount !== pile.amount) {
      if (state.terrainVersion !== 6 && state.terrainVersion !== 7) feedback.stack(pile.x, pile.z);
      else {
        const origin = typeof origins === 'function' ? null : origins.stackOrigin(pile.x, pile.z);
        if (origin) feedback.stack(pile.x, pile.z, origin);
      }
    }
  }
  for (const farm of state.buildings) {
    const box = farmBoxCell(farm),
      stock = farm.collectionBox?.stock;
    const old = previous.buildings.find((b) => b.id === farm.id)?.collectionBox?.stock;
    if (
      box &&
      stock &&
      old &&
      Object.keys(stock).some(
        (item) => stock[item as keyof typeof stock] > old[item as keyof typeof old],
      )
    )
      feedback.drop({ x: box.x + 0.5, y: (farm.baseElevation ?? 0) + 0.6, z: box.z + 0.5 });
  }
  const priorDrops = new Map((previous.looseDrops ?? []).map((d) => [d.id, d.amount]));
  for (const drop of state.looseDrops ?? []) {
    const origin = drop.amount > (priorDrops.get(drop.id) ?? 0) && dropOrigin(drop.id);
    if (origin) feedback.drop(origin);
  }
}
