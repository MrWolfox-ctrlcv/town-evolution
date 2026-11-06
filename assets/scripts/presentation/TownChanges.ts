import { farmBoxCell } from '../domain/game';
import type { GameState } from '../domain/game';
import type { SurfacePoint } from '../application/NaturalPicking';
import type { TownFeedback } from './TownFeedback';
/** Committed world changes pulse where they stay, independently of inventory flight effects. */
export function townChanges(
  previous: GameState | null,
  state: GameState,
  feedback: TownFeedback,
  dropOrigin: (id: string) => SurfacePoint | null,
): void {
  if (!previous) return;
  if (previous.mapSeed !== state.mapSeed) {
    feedback.clear();
    return;
  }
  const trees = new Set(state.trees.map((tree) => tree.id));
  for (const tree of previous.trees)
    if (!trees.has(tree.id)) {
      if (previous.terrainVersion === 5) feedback.chop(tree.x, tree.z, previous.mapSeed, true);
      else feedback.chop(tree.x, tree.z, previous.mapSeed);
    }
  for (const pile of state.groundStacks) {
    const old = previous.groundStacks.find(
      (p) => p.x === pile.x && p.z === pile.z && p.item === pile.item,
    );
    if (!old || old.amount !== pile.amount) feedback.stack(pile.x, pile.z);
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
      feedback.drop({ x: box.x + 0.5, y: 0.6, z: box.z + 0.5 });
  }
  const priorDrops = new Map((previous.looseDrops ?? []).map((d) => [d.id, d.amount]));
  for (const drop of state.looseDrops ?? []) {
    const origin = drop.amount > (priorDrops.get(drop.id) ?? 0) && dropOrigin(drop.id);
    if (origin) feedback.drop(origin);
  }
}
