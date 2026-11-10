import { V7BaseHydrology } from './v7-hydrology-base';
import { buildCoastFeature } from './v7-build-coast';
import { derivePreparedCoast } from './v7-prepared-coast';
import { buildStarter, createV6Starter } from './v6-build-starter';
import { V6Hydrology } from './v6-hydrology';
import { V6Landform } from './v6-landform';
import { V6Samples } from './v6-samples';
import { V6Terrain } from './v6-terrain';
import { buildCells } from './v6-build-cells';
import { key, V6_SIZE, V6_SUBDIVISIONS } from './v6-contracts';
import type { V6Lattice } from './v6-samples';
import type { V6Snapshot, V6Resource } from './v6-contracts';
import type { Work } from './v6-work';
import type { V7TerrainTransfer } from './v7-terrain-data';
import { V7_GENERATOR_REVISION } from './v7-contracts';
import { qualifyV7World } from './v7-qualification';
import type { V7Qualification } from './v7-qualification';

export interface PreparedV7World {
  readonly terrain: V6Terrain;
  readonly qualification: V7Qualification;
  /** Already assembled. The UI does not need a synchronous initialSnapshot pass. */
  readonly initialSnapshot: V6Snapshot;
}
function* allocateLattice(): Work<V6Lattice> {
  const length = (V6_SIZE * V6_SUBDIVISIONS + 1) ** 2;
  const layers: Float32Array[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const values = new Float32Array(length);
    layers.push(values);
    yield 'allocate-lattice';
    for (let offset = 0; offset < length; offset += 4096) {
      values.fill(NaN, offset, Math.min(length, offset + 4096));
      yield 'clear-lattice';
    }
  }
  return { grounds: layers[0]!, stones: layers[1]!, soils: layers[2]! };
}
function* reserveBounds(hydro: V6Hydrology): Work<readonly [number, number, number, number]> {
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (let z = 0; z < V6_SIZE; z++)
    for (let x = 0; x < V6_SIZE; x++) {
      if (hydro.reserveCell(x, z)) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x + 1);
        z1 = Math.max(z1, z + 1);
      }
      yield 'reserve-bounds';
    }
  return [x0, z0, x1, z1];
}
/** Internal coroutine. Only its completed return value may escape the public builder. */
export function* buildTerrainData(seed: number): Work<V7TerrainTransfer> {
  const base = new V7BaseHydrology(seed);
  yield 'hydrology';
  const feature = yield* buildCoastFeature(base);
  const hydro = new V6Hydrology(seed, base, derivePreparedCoast(base, feature));
  yield 'hydrology';
  const starter = yield* buildStarter(seed, hydro);
  const bounds = yield* reserveBounds(hydro);
  const landform = new V6Landform(seed, hydro, starter, bounds);
  const lattice = yield* allocateLattice();
  const samples = new V6Samples(seed, landform, lattice);
  const complete = yield* buildCells(samples, landform);
  return {
    format: 1,
    revision: V7_GENERATOR_REVISION,
    seed,
    feature,
    starter: { pockets: starter.pockets, treeCandidates: starter.treeCandidates },
    bounds,
    lattice,
    complete,
  };
}
/** Rebuild local closures/private fields; callers must validate incoming data first. */
export function* assembleV7Terrain(data: V7TerrainTransfer): Work<PreparedV7World> {
  const { seed, lattice, complete } = data;
  const base = new V7BaseHydrology(seed);
  const hydro = new V6Hydrology(seed, base, derivePreparedCoast(base, data.feature));
  const starter = createV6Starter(seed, data.starter.pockets, data.starter.treeCandidates);
  const landform = new V6Landform(seed, hydro, starter, data.bounds);
  const world = new V6Terrain(seed, landform, lattice, complete, V7_GENERATOR_REVISION);
  const resources = new Map<string, V6Resource>();
  const trees = new Set<string>();
  for (const deposit of complete.deposits.values()) {
    const resource = deposit.resource;
    resources.set(key(resource.x, resource.z), Object.freeze({ ...resource }));
    yield 'initial-resources';
  }
  for (const tree of complete.trees) {
    trees.add(key(tree.x, tree.z));
    yield 'initial-trees';
  }
  return Object.freeze({
    terrain: world,
    qualification: yield* qualifyV7World(world, base.coastBoundaryUpper),
    initialSnapshot: Object.freeze({ resources, trees }),
  });
}

export function* buildTerrain(seed: number): Work<PreparedV7World> {
  return yield* assembleV7Terrain(yield* buildTerrainData(seed));
}
