import { getV5World } from './v5-world';
import { V5HeightRecipe } from './v5-height-recipe';
import type { V5Reference, V5NaturalResource } from './v5-height-recipe';
export interface V5Point {
  x: number;
  z: number;
}
export interface V5Tree extends V5Point {
  id: string;
}
export interface V5NewFoundation {
  trees: V5Tree[];
  naturalResources: V5NaturalResource[];
  nextTreeId: number;
}
const key = (p: V5Point) => `${p.x},${p.z}`;
/** NEW v5 initialization only. Never call on import or to repair a missing saved list.
 * Tree candidates are coordinates, not IDs. Assign the production tN namespace exactly once.
 * Existing v1-v4 saves/generators and their IDs are outside this API.
 */
export function allocateV5Foundation(
  reference: V5Reference,
  treeCandidates: readonly V5Point[],
  blockedCells: readonly V5Point[] = [],
  nextTreeId = 1,
  preparedRecipe?: V5HeightRecipe,
): V5NewFoundation {
  if (!Number.isInteger(nextTreeId) || nextTreeId < 1 || nextTreeId >= 1_000_000_000)
    throw new Error('Invalid tree sequence');
  if (preparedRecipe && !preparedRecipe.usesReference(reference))
    throw new Error('Prepared recipe belongs to a different reference');
  const recipe = preparedRecipe ?? new V5HeightRecipe(reference);
  const blocked = new Set(blockedCells.map(key));
  const naturalResources = recipe.resourcesForNewWorld().filter((r) => !blocked.has(key(r)));
  for (const r of naturalResources) blocked.add(key(r));
  const trees: V5Tree[] = [];
  const ordered = treeCandidates.slice().sort((a, b) => a.z - b.z || a.x - b.x);
  for (const p of ordered) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.z)) throw new Error('Invalid tree position');
    if (blocked.has(key(p))) continue;
    const c = reference.at(p.x, p.z);
    if (!c || c.biome !== 'forest' || c.surfaceHeight !== 0) continue;
    if (nextTreeId >= 1_000_000_000) throw new Error('Tree sequence exhausted');
    trees.push({ id: `t${nextTreeId++}`, x: p.x, z: p.z });
    blocked.add(key(p));
  }
  return { trees, naturalResources, nextTreeId };
}

/** New worlds only; saved remaining lists are never passed through population. */
export function createV5Foundation(
  seed: number,
  blockedCells: readonly V5Point[] = [],
  nextTreeId = 1,
): V5NewFoundation {
  const world = getV5World(seed);
  return allocateV5Foundation(
    world.reference,
    world.treeCandidates,
    blockedCells,
    nextTreeId,
    world.recipe,
  );
}
