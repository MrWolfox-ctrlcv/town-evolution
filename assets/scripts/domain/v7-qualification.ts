import type { V6Terrain } from './v6-terrain';
import type { Work } from './v6-work';
import { v7LegacyV3LandCell } from './v7-legacy-land';
import { V7_FIELD_EPSILON } from './v7-contracts';
export interface V7Qualification {
  readonly landCells: number;
  readonly legacyV3LandCells: number;
  readonly connectedLandCells: number;
  readonly connectedWaterCells: number;
  readonly biomes: Readonly<Record<'plain' | 'hill' | 'mountain' | 'forest', number>>;
  readonly borderBedUpper: number;
}
function* flood(mask: Uint8Array, start: number): Work<number> {
  if (!mask[start]) return 0;
  const queue = new Int32Array(mask.length);
  queue[0] = start;
  mask[start] = 2;
  let length = 1;
  for (let i = 0; i < length; i++) {
    const n = queue[i]!,
      x = n % 192,
      z = Math.floor(n / 192);
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const a = x + dx!,
        b = z + dz!,
        j = b * 192 + a;
      if (a >= 0 && a < 192 && b >= 0 && b < 192 && mask[j] === 1) {
        mask[j] = 2;
        queue[length++] = j;
      }
    }
    yield 'qualification-connectivity';
  }
  return length;
}
/** Every traversal is cooperative and read-only. No seed substitution or terrain repair. */
export function* qualifyV7World(
  world: V6Terrain,
  coastBoundaryUpper: number,
): Work<V7Qualification> {
  if (!Number.isFinite(coastBoundaryUpper) || coastBoundaryUpper > -2.25)
    throw Error('V7 qualification: unproven boundary water belt');
  // Worst permitted analytic value is -2.25. Expand both the field and bed for rounding.
  const edgeBedUpper = 0.015 - (0.59 + (2.25 - V7_FIELD_EPSILON - 1.95) * (0.15 / 0.4));
  if (edgeBedUpper + V7_FIELD_EPSILON >= -0.642)
    throw Error('V7 qualification: insufficient numerical boundary margin');
  yield 'qualification-border';
  const land = new Uint8Array(192 * 192),
    water = new Uint8Array(192 * 192);
  let landCells = 0,
    legacyV3LandCells = 0,
    first = -1;
  let starterStone = false,
    starterSoil = false,
    starterTree = false;
  const biomes = { plain: 0, hill: 0, mountain: 0, forest: 0 };
  for (let z = 0; z < 192; z++)
    for (let x = 0; x < 192; x++) {
      const cell = world.at(x, z),
        hydro = world.hydrology.classifyCell(x, z);
      if (cell) {
        land[z * 192 + x] = 1;
        landCells++;
        biomes[cell.biome]++;
        if (first < 0) first = z * 192 + x;
        if (!cell.reserved && hydro.dryLower >= 1.8 && Math.hypot(x - 5, z - 5) < 25) {
          if (cell.resource?.kind === 'stone') starterStone = true;
          if (cell.resource?.kind === 'soil') starterSoil = true;
        }
      }
      if (hydro.state === 'clearWater') water[z * 192 + x] = 1;
      if (x < 40 && z < 40 && v7LegacyV3LandCell(x, z, world.seed)) legacyV3LandCells++;
      yield 'qualification-cells';
    }
  if (landCells < 20 * legacyV3LandCells)
    throw Error('V7 qualification: less than 20 times legacy land');
  const connectedLandCells = yield* flood(land, first);
  if (connectedLandCells !== landCells) throw Error('V7 qualification: disconnected land');
  if (Object.values(biomes).some((n) => !n)) throw Error('V7 qualification: missing biome');
  // Borders are validated against the actual water-bed function at all mesh vertices.
  let borderBedUpper = -Infinity;
  for (let i = 0; i <= 768; i++) {
    const p = i / 4;
    for (const [x, z] of [
      [0, p],
      [192, p],
      [p, 0],
      [p, 192],
    ])
      borderBedUpper = Math.max(
        borderBedUpper,
        Math.fround(world.hydrology.sample(x!, z!, 'water').height),
      );
    yield 'qualification-border';
  }
  if (borderBedUpper + V7_FIELD_EPSILON >= -0.642)
    throw Error('V7 qualification: dry world boundary');
  const connectedWaterCells = yield* flood(water, 191);
  const [lx, lz] = world.hydrology.metadata.lake;
  const witnesses = [
    [lx, lz],
    [172, 94],
    [83, 173],
    [190, 190],
  ];
  for (const [x, z] of witnesses) {
    if (water[Math.floor(z!) * 192 + Math.floor(x!)] !== 2)
      throw Error('V7 qualification: lake/bay outlet disconnected');
    yield 'qualification-water';
  }
  // Every original river center segment remains within the certified water component.
  for (const [x, z] of world.hydrology.riverPath) {
    if (x >= 0 && x < 192 && z >= 0 && z < 192 && water[Math.floor(z) * 192 + Math.floor(x)] !== 2)
      throw Error('V7 qualification: disconnected river');
    yield 'qualification-water';
  }
  for (let z = 3; z <= 5; z++)
    for (let x = 3; x <= 8; x++) {
      const c = world.at(x, z);
      if (
        !c ||
        c.resource ||
        c.groundRange[1] - c.groundRange[0] > 1e-6 ||
        Math.abs(c.baseElevation - 0.015) > 1e-6
      )
        throw Error('V7 qualification: invalid spawn');
      yield 'qualification-cells';
    }
  if (!starterStone || !starterSoil)
    throw Error('V7 qualification: missing editable starter material');
  for (const p of world.treeCandidates) {
    if (Math.hypot(p.x - 5, p.z - 5) < 25) starterTree = true;
    yield 'qualification-cells';
  }
  if (!starterTree) throw Error('V7 qualification: missing starter tree');
  return Object.freeze({
    landCells,
    legacyV3LandCells,
    connectedLandCells,
    connectedWaterCells,
    biomes: Object.freeze(biomes),
    borderBedUpper,
  });
}
