import type { Building, Tree } from './types';

/** Temporary first-play balance. Running jobs and planted trees retain their snapshots. */
export const NURSERY = {
  durationMs: 15_000,
  yield: 1,
  treeDurationMs: 30_000,
};

export type NurseryStage = 'empty' | 'seeded' | 'growing' | 'ready';

export function nurseryStage(building: Building, now: number): NurseryStage {
  if (!building.nurserySeeded) return 'empty';
  if (!building.job) return 'seeded';
  return now >= building.job.readyAt ? 'ready' : 'growing';
}

/** Original saved trees have no growth timestamps and remain harvestable immediately. */
export function isTreeMature(tree: Tree, now: number): boolean {
  return tree.readyAt === undefined || now >= tree.readyAt;
}

/** Pure presentation input; no timer or mutation is needed to finish offline growth. */
export function treeGrowthProgress(tree: Tree, now: number): number {
  if (tree.readyAt === undefined || tree.plantedAt === undefined) return 1;
  if (now >= tree.readyAt) return 1;
  return Math.max(0, Math.min(1, (now - tree.plantedAt) / (tree.readyAt - tree.plantedAt)));
}
