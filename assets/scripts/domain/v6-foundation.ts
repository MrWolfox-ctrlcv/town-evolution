import { getEditableWorld } from './editable-world';
import type { TerrainVersion } from './world';
import type { V6Resource } from './v6-contracts';
interface Point {
  x: number;
  z: number;
}
export interface V6NewFoundation {
  trees: Array<Point & { id: string }>;
  naturalResources: V6Resource[];
  nextTreeId: number;
}
/** New game only. Saved missing resources/trees are never populated again. */
export function createV6Foundation(
  seed: number,
  blockedCells: readonly Point[] = [],
  nextTreeId = 1,
  version: TerrainVersion = 6,
): V6NewFoundation {
  if (!Number.isInteger(nextTreeId) || nextTreeId < 1 || nextTreeId >= 1_000_000_000)
    throw Error('Invalid tree sequence');
  const world = getEditableWorld(seed, version),
    key = (p: Point) => `${p.x},${p.z}`;
  const blocked = new Set(blockedCells.map(key));
  const naturalResources = world
    .initialResources()
    .filter((r) => !blocked.has(key(r)))
    .map((r) => ({ ...r }));
  for (const r of naturalResources) blocked.add(key(r));
  const trees: V6NewFoundation['trees'] = [];
  for (const p of world.treeCandidates) {
    if (blocked.has(key(p))) continue;
    if (nextTreeId >= 1_000_000_000) throw Error('Tree sequence exhausted');
    trees.push({ id: `t${nextTreeId++}`, x: p.x, z: p.z });
    blocked.add(key(p));
  }
  return { trees, naturalResources, nextTreeId };
}
