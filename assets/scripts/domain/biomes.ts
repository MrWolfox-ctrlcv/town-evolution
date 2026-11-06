import type { TerrainVersion } from './world';
import { getV5World } from './v5-world';
import { largeIslandBiome } from './large-island';
import { fractalNoise, latticeNoise } from './noise';
export type TerrainBiome = 'plain' | 'mountain' | 'forest' | 'hill';
export interface TerrainCell {
  biome: TerrainBiome;
  /** Initial number of resource cubes above the level building surface, not current stock. */
  elevation: number;
}
/** Central mountains and noise-driven surrounding biomes, never fixed compass sectors. */
export function legacyBiomeAt(x: number, z: number, seed: number): TerrainCell {
  // The inherited starter coordinates sit in a small, safe coastal plain.
  if (x < 12 && z < 12) return { biome: 'plain', elevation: 0 };
  const centerX = 20 + (fractalNoise(0.37, 0.61, seed + 91) - 0.5) * 4;
  const centerZ = 19 + (fractalNoise(0.61, 0.37, seed + 193) - 0.5) * 4;
  const wx = x + (fractalNoise(x / 8, z / 8, seed + 41) - 0.5) * 3;
  const wz = z + (fractalNoise(x / 8, z / 8, seed + 73) - 0.5) * 3;
  const distance = Math.hypot(wx - centerX, wz - centerZ);
  const ridge = 5.2 + fractalNoise(x / 6, z / 6, seed + 227) * 3;
  if (distance < ridge)
    return {
      biome: 'mountain',
      elevation: Math.min(4, 1 + Math.floor((1 - distance / ridge) * 4)),
    };
  // Independent fields distribute woodland and earth mounds around every side of the peak.
  const woodland = fractalNoise(x / 5.4, z / 5.4, seed + 379);
  const earth = fractalNoise(x / 4.7, z / 4.7, seed + 563);
  if (earth > 0.54) return { biome: 'hill', elevation: earth > 0.65 ? 2 : 1 };
  return { biome: woodland > 0.46 ? 'forest' : 'plain', elevation: 0 };
}

/** Version 3 keeps coastal play space but breaks the old concentric mountain into ridges. */
export function biomeAt(
  x: number,
  z: number,
  seed: number,
  version: TerrainVersion = 4,
): TerrainCell {
  if (version === 5) {
    const cell = getV5World(seed).at(x, z);
    return cell
      ? { biome: cell.biome, elevation: cell.elevation }
      : { biome: 'plain', elevation: 0 };
  }
  if (version === 1) return { biome: 'plain', elevation: 0 };
  if (version === 4) {
    if (x >= 40 || z >= 40) return largeIslandBiome(x, z, seed);
    const cell = biomeAt(x, z, seed, 3);
    return cell.biome === 'mountain' ? { ...cell, elevation: cell.elevation * 2 } : cell;
  }
  if (version === 2) return legacyBiomeAt(x, z, seed);
  if (x < 12 && z < 12) return { biome: 'plain', elevation: 0 };
  const cx = 20 + (latticeNoise(2, 7, seed + 91) - 0.5) * 2;
  const cz = 19 + (latticeNoise(7, 2, seed + 193) - 0.5) * 2;
  const angle = latticeNoise(3, 5, seed + 73) * Math.PI * 2;
  const dx = x - cx,
    dz = z - cz;
  const rx = dx * Math.cos(angle) - dz * Math.sin(angle);
  const rz = dx * Math.sin(angle) + dz * Math.cos(angle);
  const warpX = rx + (fractalNoise(x / 3.1, z / 3.1, seed + 41) - 0.5) * 1.7;
  const warpZ = rz + (fractalNoise(x / 3.1, z / 3.1, seed + 227) - 0.5) * 1.7;
  let rock = 0;
  // Unequal, offset summits and narrow saddles form a mountain range, not a square pyramid.
  for (const [px, pz, width, depth, height] of [
    [0, 0, 1.85, 2.05, 4.7],
    [-4.5, 1.9, 1.65, 1.9, 4.1],
    [4.3, -1.8, 1.6, 1.75, 4.4],
    [0.6, 4.6, 1.7, 1.65, 3.7],
  ]) {
    const distance = ((warpX - px!) / width!) ** 2 + ((warpZ - pz!) / depth!) ** 2;
    rock = Math.max(rock, height! * Math.exp(-distance * 0.5));
  }
  const erosion = (fractalNoise(x / 1.9, z / 1.9, seed + 997) - 0.5) * 1.25;
  const elevation = Math.max(0, Math.min(4, Math.floor(rock + erosion)));
  if (elevation > 0) return { biome: 'mountain', elevation };
  let hill = 0;
  // Scattered seeded ellipses replace the old continuous soil noise threshold.
  const centers: Array<[number, number]> = [];
  for (let i = 0; i < 24 && centers.length < 10; i++) {
    const a = latticeNoise(i, 11, seed + 563) * Math.PI * 2;
    const radius = 8 + latticeNoise(i, 19, seed + 379) * 6;
    const hx = cx + Math.cos(a) * radius,
      hz = cz + Math.sin(a) * radius;
    if (centers.some(([px, pz]) => Math.hypot(hx - px, hz - pz) < 4.5)) continue;
    centers.push([hx, hz]);
    const width = 1.25 + latticeNoise(i, 23, seed + 701) * 1.15;
    const depth = 1.2 + latticeNoise(i, 29, seed + 839) * 1.4;
    const distance = ((x - hx) / width) ** 2 + ((z - hz) / depth) ** 2;
    hill = Math.max(hill, (2.1 + latticeNoise(i, 31, seed) * 0.8) * Math.exp(-distance * 0.8));
  }
  const earth = Math.max(
    0,
    Math.min(2, Math.floor(hill + (fractalNoise(x / 2.3, z / 2.3, seed + 467) - 0.5) * 0.65)),
  );
  if (earth > 0) return { biome: 'hill', elevation: earth };
  const woodland = fractalNoise(x / 5.4, z / 5.4, seed + 379);
  return { biome: woodland > 0.46 ? 'forest' : 'plain', elevation: 0 };
}
