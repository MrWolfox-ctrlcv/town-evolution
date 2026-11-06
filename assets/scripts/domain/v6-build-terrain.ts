import { V5BaseHydrology } from './v5-hydrology-base';
import { buildCoastFeature } from './v6-build-coast';
import { derivePreparedCoast } from './v6-prepared-coast';
import { buildStarter } from './v6-build-starter';
import { V6Hydrology } from './v6-hydrology';
import { V6Landform } from './v6-landform';
import { V6Samples } from './v6-samples';
import { V6Terrain } from './v6-terrain';
import { buildCells } from './v6-build-cells';
import { key, V6_SIZE, V6_SUBDIVISIONS } from './v6-contracts';
import type { V6Lattice } from './v6-samples';
import type { V6Snapshot, V6Resource } from './v6-contracts';
import type { Work } from './v6-work';

export interface PreparedV6World {
  readonly terrain: V6Terrain;
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
export function* buildTerrain(seed: number): Work<PreparedV6World> {
  const base = new V5BaseHydrology(seed);
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
  const world = new V6Terrain(seed, landform, lattice, complete);
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
    initialSnapshot: Object.freeze({ resources, trees }),
  });
}
