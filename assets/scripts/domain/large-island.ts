import { fractalNoise, latticeNoise } from './noise';
import { MAX_TERRAIN_HEIGHT } from './world';
/** The large world's terrain stays sparse: broad exploration space, a few tall ranges. */
export function largeIslandBiome(x: number, z: number, seed: number) {
  const angle = (latticeNoise(3, 5, seed + 73) - 0.5) * 0.6;
  const cx = 96 + (latticeNoise(2, 7, seed + 91) - 0.5) * 12;
  const cz = 91 + (latticeNoise(7, 2, seed + 193) - 0.5) * 12;
  const dx = x - cx,
    dz = z - cz;
  const rx = dx * Math.cos(angle) - dz * Math.sin(angle);
  const rz = dx * Math.sin(angle) + dz * Math.cos(angle);
  const wx = rx + (fractalNoise(x / 5, z / 5, seed + 41) - 0.5) * 2;
  const wz = rz + (fractalNoise(x / 5, z / 5, seed + 227) - 0.5) * 2;
  let rock = 0;
  for (const [px, pz, width, depth, height] of [
    [0, 0, 4.2, 4.8, 16.8],
    [-11, -8, 3.8, 4.2, 13.8],
    [12, 8, 3.8, 4.8, 15.8],
    [20, -13, 3.2, 3.7, 11.8],
  ]) {
    const distance = Math.hypot((wx - px!) / width!, (wz - pz!) / depth!);
    // Sharper conical shoulders and independent crests rather than a low Gaussian dome.
    rock = Math.max(rock, height! * Math.max(0, 1 - distance / 2.25) ** 1.4);
  }
  const roughness = (fractalNoise(x / 1.7, z / 1.7, seed + 997) - 0.5) * 1.7;
  const elevation = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.floor(rock + roughness)));
  if (elevation > 0) return { biome: 'mountain' as const, elevation };
  let hill = 0;
  for (let i = 0; i < 14; i++) {
    const a = latticeNoise(i, 11, seed + 563) * Math.PI * 2;
    const radius = 24 + latticeNoise(i, 19, seed + 379) * 33;
    const hx = cx + Math.cos(a) * radius,
      hz = cz + Math.sin(a) * radius;
    const distance = Math.hypot((x - hx) / 2.3, (z - hz) / 2.8);
    hill = Math.max(hill, 3.8 * Math.max(0, 1 - distance / 1.6));
  }
  const earth = Math.max(0, Math.min(3, Math.floor(hill)));
  if (earth) return { biome: 'hill' as const, elevation: earth };
  return {
    biome:
      fractalNoise(x / 11, z / 11, seed + 379) > 0.46 ? ('forest' as const) : ('plain' as const),
    elevation: 0,
  };
}
