import type { GameState } from './types';
import { requireRule } from './guards';
/** Build-time checks and imports must agree: no later layout may bury a persisted drop. */
export function validateDropPlacements(state: GameState): void {
  const trees = new Set(state.trees.map((p) => `${p.x},${p.z}`));
  const piles = new Set(state.groundStacks.map((p) => `${p.x},${p.z}`));
  const resources = new Map(state.naturalResources.map((p) => [`${p.x},${p.z}`, p]));
  for (const drop of state.looseDrops) {
    const key = `${Math.floor(drop.x6 / 6)},${Math.floor(drop.z6 / 6)}`;
    requireRule(!trees.has(key) && !piles.has(key), '掉落物与树木或地堆重叠');
    const resource = resources.get(key);
    requireRule(
      !resource ||
        (drop.source.type === 'natural' &&
          drop.source.resourceId === resource.id &&
          drop.source.kind === resource.kind),
      '掉落物与其它天然资源重叠',
    );
  }
}
