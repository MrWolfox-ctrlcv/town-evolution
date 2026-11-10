import { v6FineRenderBatches } from './V6RenderBatches';
import type { V6SurfaceChunk, V6SurfaceSource } from './V6SurfaceContracts';
import type { V6CellPatch, V6CellSpan } from './V6CellSpans';
import type { V5CoastSource } from './V6Coast';
import type { V6SurfaceCache } from './V6SurfaceCache';
import type { V6SurfaceJob } from './V6SurfaceChunkWork';
export const v6SurfaceNeighbors = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
interface Inputs {
  wanted: ReadonlySet<string>;
  detailed: ReadonlySet<string>;
  live: ReadonlyMap<string, V6SurfaceChunk>;
  patches: ReadonlyMap<string, Map<string, V6CellPatch>>;
  coasts: ReadonlyMap<string, V6CellSpan>;
  dirty: ReadonlySet<string>;
  lodDirty: ReadonlySet<string>;
  coastDirty: ReadonlySet<string>;
  source: V6SurfaceSource;
  coast: V5CoastSource;
  cache: V6SurfaceCache;
  farError: number;
}
/** Retain the whole atomic group or none of it; eviction jobs are never resumable builds. */
export function canRetainV6SurfaceJobs(
  jobs: readonly V6SurfaceJob[],
  wanted: ReadonlySet<string>,
  signature: (key: string) => string,
): boolean {
  return (
    jobs.length > 0 &&
    jobs.every((job) => job.wanted && wanted.has(job.key) && job.signature === signature(job.key))
  );
}
export function createV6SurfaceJob(key: string, s: Inputs): V6SurfaceJob {
  const wanted = s.wanted.has(key),
    signature = s.cache.signature(key, s.detailed, s.farError),
    cached = wanted ? s.cache.find(signature) : undefined,
    [cx, cz] = key.split(',').map(Number),
    cells: Array<[number, number]> = [];
  if (wanted && !cached)
    for (let z = cz! * 16; z < (cz! + 1) * 16; z++)
      for (let x = cx! * 16; x < (cx! + 1) * 16; x++)
        if (
          x >= 0 &&
          z >= 0 &&
          x < s.source.world.size &&
          z < s.source.world.size &&
          (!s.live.has(key) || s.lodDirty.has(key) || s.dirty.has(`${x},${z}`))
        )
          cells.push([x, z]);
  return {
    key,
    wanted,
    signature,
    cached,
    detail: s.detailed.has(key),
    previousBatches:
      s.detailed.has(key) &&
      s.live.get(key)?.detail &&
      !s.lodDirty.has(key) &&
      !s.coastDirty.has(key)
        ? v6FineRenderBatches(s.live.get(key)!.mesh)
        : undefined,
    cells,
    index: 0,
    cellJob: null,
    cellCost: 0,
    patches: wanted && !cached ? new Map(s.patches.get(key)) : new Map(),
    spans: cached?.spans ?? new Map(),
    coastJob:
      wanted &&
      !cached &&
      (!s.coasts.has(key) ||
        s.coastDirty.has(key) ||
        s.live.get(key)?.detail !== s.detailed.has(key))
        ? s.coast.begin(key, !s.detailed.has(key))
        : null,
    coast: cached ? cached.coast : wanted ? (s.coasts.get(key) ?? null) : null,
    merge: null,
  };
}
