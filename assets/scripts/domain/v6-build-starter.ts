import { sortWork } from './v6-work';
import type { Work } from './v6-work';
import { fractalNoise, latticeNoise } from './noise';
type StarterBiome = 'plain' | 'mountain' | 'hill' | 'forest';
interface StarterCell {
  biome: StarterBiome;
  surfaceHeight: number;
}
interface LegacyCell {
  biome: StarterBiome;
  elevation: number;
}
/** Frozen seed-local v3 mathematical input, not an old save or recursive game creation. */
function legacyCandidate(x: number, z: number, seed: number): LegacyCell {
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

function jitter(seed: number, x: number, z: number): number {
  let n = (seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
/** Small asymmetric starter pockets. Everything outside the starter corner stays untouched. */
export function* buildStarter(
  seed: number,
  hydro: {
    at(x: number, z: number): { state: string } | null;
    fields(x: number, z: number): { dry: number };
  },
): Work<V6Starter> {
  const candidates: { x: number; z: number; biome: StarterBiome; d: number }[] = [];
  for (let z = 9; z < 34; z++)
    for (let x = 9; x < 34; x++) {
      yield 'starter-candidates';
      const old = legacyCandidate(x, z, seed);
      if (
        old.elevation > 0 &&
        Math.hypot(x - 5, z - 5) < 25 &&
        hydro.at(x, z)?.state === 'dryBuildable' &&
        hydro.fields(x + 0.5, z + 0.5).dry >= 2
      )
        candidates.push({
          x,
          z,
          biome: old.biome,
          d: Math.hypot(x - 5, z - 5),
        });
    }
  const pockets: V6Starter['pockets'] = [];
  for (const [i, biome] of (['mountain', 'hill'] as const).entries()) {
    const matches = candidates.filter((candidate) => candidate.biome === biome);
    const sorted = yield* sortWork(
      matches,
      (a, b) => a.d + jitter(seed, a.x, a.z) * 1.4 - b.d - jitter(seed, b.x, b.z) * 1.4,
      'starter-sort',
    );
    const p = sorted[0];
    if (!p) throw Error('No safe v5 starter resource pocket');
    pockets.push({
      ...p,
      angle: jitter(seed, p.x, p.z) * Math.PI,
      rx: i ? 2.4 : 2.7,
      rz: i ? 1.9 : 2.15,
      peak: i ? 1.8 : 2.8,
    });
  }
  const clear = (x: number, z: number) => x >= 1 && x <= 9 && z >= 1 && z <= 7;
  const at = (x: number, z: number) => starterCellAt(seed, pockets, x, z);
  const treeCandidates: { x: number; z: number }[] = [];
  let options: { x: number; z: number; score: number }[] = [];
  for (let z = 1; z < 36; z++)
    for (let x = 1; x < 36; x++) {
      yield 'starter-trees';
      if (
        !clear(x, z) &&
        Math.hypot(x - 5, z - 5) > 6 &&
        hydro.at(x, z)?.state === 'dryBuildable' &&
        hydro.fields(x + 0.5, z + 0.5).dry >= 1.8 &&
        at(x, z)?.biome === 'forest'
      )
        options.push({
          x,
          z,
          score: Math.hypot(x - 5, z - 5) + jitter(seed, x, z) * 2,
        });
    }
  options = yield* sortWork(
    options,
    (a, b) => a.score - b.score || a.z - b.z || a.x - b.x,
    'starter-sort',
  );
  for (const p of options) {
    yield 'starter-trees';
    if (treeCandidates.length >= 18) break;
    if (treeCandidates.some((q) => Math.abs(q.x - p.x) + Math.abs(q.z - p.z) < 2)) continue;
    treeCandidates.push({ x: p.x, z: p.z });
  }
  return createV6Starter(seed, pockets, treeCandidates);
}

export interface V6Starter {
  at(x: number, z: number): StarterCell | null;
  treeCandidates: { x: number; z: number }[];
  pockets: {
    x: number;
    z: number;
    biome: StarterBiome;
    d: number;
    angle: number;
    rx: number;
    rz: number;
    peak: number;
  }[];
}

function starterCellAt(
  seed: number,
  pockets: V6Starter['pockets'],
  x: number,
  z: number,
): StarterCell | null {
  if (x >= 36 || z >= 36 || (x >= 1 && x <= 9 && z >= 1 && z <= 7)) return null;
  for (const p of pockets) {
    const dx = x - p.x,
      dz = z - p.z,
      c = Math.cos(p.angle),
      s = Math.sin(p.angle),
      d = ((dx * c + dz * s) / p.rx) ** 2 + ((-dx * s + dz * c) / p.rz) ** 2,
      h = p.peak * Math.max(0, 1 - d) ** 2 * (0.93 + 0.14 * jitter(seed, x, z));
    if (h > 0.02) return { biome: p.biome, surfaceHeight: h };
  }
  return legacyCandidate(x, z, seed).biome === 'forest'
    ? { biome: 'forest', surfaceHeight: 0 }
    : null;
}

/** Recreate local methods from validated recipe data, never clone a closure. */
export function createV6Starter(
  seed: number,
  pockets: V6Starter['pockets'],
  treeCandidates: V6Starter['treeCandidates'],
): V6Starter {
  return { at: (x, z) => starterCellAt(seed, pockets, x, z), treeCandidates, pockets };
}
