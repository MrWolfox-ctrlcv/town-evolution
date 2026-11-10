import type { NaturalCoastFeature } from './v5-natural-coast-types';
import type { V6Starter } from './v6-build-starter';
import type { V6Lattice } from './v6-samples';
import type { CompletedCells } from './v6-terrain';
import type { V7_GENERATOR_REVISION } from './v7-contracts';
/** Private runtime IPC only, never a saved-game format or a serializable world instance. */
export interface V7TerrainTransfer {
  readonly format: 1;
  readonly revision: typeof V7_GENERATOR_REVISION;
  readonly seed: number;
  readonly feature: NaturalCoastFeature;
  readonly starter: Pick<V6Starter, 'pockets' | 'treeCandidates'>;
  readonly bounds: readonly [number, number, number, number];
  readonly lattice: V6Lattice;
  readonly complete: CompletedCells;
}
export function v7TransferBuffers(data: V7TerrainTransfer): ArrayBuffer[] {
  return [data.lattice.grounds, data.lattice.stones, data.lattice.soils].map((a) => {
    if (!(a.buffer instanceof ArrayBuffer)) throw Error('Invalid transferable lattice');
    return a.buffer;
  });
}
