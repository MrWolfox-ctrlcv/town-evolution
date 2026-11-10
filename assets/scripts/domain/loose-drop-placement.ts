import { getV6EditSurface } from './v6-edit-surface';
import type { GameState } from './types';
import { requireRule } from './guards';
/** Build-time checks and imports must agree: no later layout may bury a persisted drop. */
export function validateDropPlacements(state: GameState): void {
  const trees = new Set(state.trees.map((p) => `${p.x},${p.z}`));
  const piles = new Set(state.groundStacks.map((p) => `${p.x},${p.z}`));
  const surface =
    state.terrainVersion === 6 || state.terrainVersion === 7 ? getV6EditSurface(state) : null;
  const resources = new Map(
    state.naturalResources
      .filter((p) => !surface || surface.exposedResourceAt(p.x, p.z))
      .map((p) => [`${p.x},${p.z}`, p]),
  );
  for (const drop of state.looseDrops) {
    if (drop.source.type === 'terrain6') {
      const source = drop.source;
      requireRule(
        (state.terrainVersion === 6 || state.terrainVersion === 7) &&
          state.terrain6?.cells.some((c) => c.x === source.x && c.z === source.z),
        'v6掉落缺少来源地形检查点',
      );
    }
    const key = `${Math.floor(drop.x6 / 6)},${Math.floor(drop.z6 / 6)}`;
    requireRule(!trees.has(key) && !piles.has(key), '掉落物与树木或地堆重叠');
    const resource = resources.get(key);
    requireRule(
      !resource ||
        (drop.source.type === 'natural' &&
          drop.source.resourceId === resource.id &&
          drop.source.kind === resource.kind) ||
        (drop.source.type === 'terrain6' &&
          drop.source.x === resource.x &&
          drop.source.z === resource.z),
      '掉落物与其它天然资源重叠',
    );
  }
}
