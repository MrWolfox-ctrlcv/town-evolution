import type { TerrainVersion } from './world';
import type { GameState, LandCell } from './types';
import { worldSize } from './world';
import { CONFIG } from './config';
import { isLandCell } from './island';
import { biomeAt } from './biomes';
export type { TerrainBiome, TerrainCell } from './biomes';
export function terrainAt(
  x: number,
  z: number,
  seed = 1,
  version: TerrainVersion = 4,
  extensions: readonly LandCell[] = [],
) {
  if (!isLandCell(x, z, seed, version, extensions)) return null;
  if (extensions.some((p) => p.x === x && p.z === z))
    return { biome: 'plain' as const, elevation: 0 };
  if (version === 1) return { biome: 'plain' as const, elevation: 0 };
  const cell = biomeAt(x, z, seed, version);
  if (version === 5) return cell;
  // An accessible coastal apron leaves real dock footprints on all sides of every island.
  if (cell.elevation > 0)
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++)
        if (!isLandCell(x + dx, z + dz, seed, version)) return { ...cell, elevation: 0 };
  return cell;
}
/** Only new-world creation calls this. Loading an old save must not restore depleted material. */
export function populateNaturalResources(s: GameState): void {
  for (let z = 1; z < worldSize(s.terrainVersion) - 1; z++)
    for (let x = 1; x < worldSize(s.terrainVersion) - 1; x++) {
      const cell = terrainAt(x, z, s.mapSeed, s.terrainVersion);
      if (!cell || cell.elevation === 0) continue;
      if (
        s.trees.some((t) => t.x === x && t.z === z) ||
        s.groundStacks.some((p) => p.x === x && p.z === z) ||
        s.naturalResources.some((p) => p.x === x && p.z === z) ||
        s.buildings.some((b) => {
          const d = CONFIG.buildings[b.kind];
          const width = b.rotation % 2 ? d.depth : d.width;
          const depth = b.rotation % 2 ? d.width : d.depth;
          return x >= b.x - 1 && x < b.x + width + 1 && z >= b.z - 1 && z < b.z + depth + 1;
        })
      )
        continue;
      s.naturalResources.push({
        id: `n${x}_${z}`,
        kind: cell.biome === 'mountain' ? 'stone' : 'soil',
        x,
        z,
        amount: cell.elevation,
      });
    }
}
