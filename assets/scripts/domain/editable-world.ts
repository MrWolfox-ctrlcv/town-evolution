import type { TerrainVersion } from './world';
import { getV6World } from './v6-world';
import { getV7World } from './v7-world';
/** Dispatch by explicit world identity; equal seeds never share revisions or caches. */
export function getEditableWorld(seed: number, version: TerrainVersion) {
  if (version === 6) return getV6World(seed);
  if (version === 7) return getV7World(seed);
  throw Error('Terrain version is not editable');
}
