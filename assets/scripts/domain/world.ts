/** Terrain generation is versioned independently from the save schema. */
export type TerrainVersion = 1 | 2 | 3 | 4 | 5 | 6;
export const WORLD_SIZE = 192;
export const MAX_TERRAIN_HEIGHT = 16;
/** Old worlds retain their exact coordinates, coast, depletion, and map limits. */
export function worldSize(version: TerrainVersion): number {
  return version >= 4 ? WORLD_SIZE : 40;
}
