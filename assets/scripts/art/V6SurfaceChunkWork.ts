import type { MeshData } from './AssetTypes';
import { V6SurfaceSupport } from '../application/V6SurfaceSupport';
import { prepareV6TerrainPickingSteps } from '../application/V6TerrainPicking';
import type { V5CoastJob } from './V6Coast';
import type { V6SurfaceChunk, V6SurfaceMesh } from './V6SurfaceContracts';
import { appendV6Cell, type V6CellPatch, type V6CellSpan } from './V6CellSpans';
import { emptyV6SurfaceMesh, appendV6Mesh, finishV6ChunkSteps } from './V6SurfaceMerge';
import { V6SurfaceBudget, v6SurfaceCost } from './V6SurfaceBudget';
export interface V6SurfaceJob {
  key: string;
  detail: boolean;
  cells: Array<[number, number]>;
  index: number;
  cellJob: Generator<V6SurfaceMesh, V6SurfaceMesh> | null;
  cellCost: number;
  coastJob: V5CoastJob | null;
  coast: MeshData | V6CellSpan | null;
  patches: Map<string, V6CellPatch>;
  spans: Map<string, V6CellSpan>;
  merge: Generator<void, V6SurfaceChunk> | null;
}
export function* mergeV6SurfaceJob(
  job: V6SurfaceJob,
  budget: V6SurfaceBudget,
): Generator<void, V6SurfaceChunk> {
  let bytes = job.coast ? v6SurfaceCost(job.coast) : 0;
  for (const patch of job.patches.values()) bytes += v6SurfaceCost(patch);
  budget.reserve(bytes);
  const mesh = emptyV6SurfaceMesh();
  if (job.coast) {
    if ('mesh' in job.coast) appendV6Cell(mesh, job.coast);
    else appendV6Mesh(mesh, job.coast);
    job.coast = {
      mesh,
      vertexStart: 0,
      vertexEnd: mesh.positions.length / 3,
      triangleStart: 0,
      triangleEnd: mesh.triangles.length,
      min: job.coast.min,
      max: job.coast.max,
    };
  }
  yield;
  for (const [key, patch] of job.patches) {
    job.spans.set(key, appendV6Cell(mesh, patch));
    yield;
  }
  let chunk: V6SurfaceChunk;
  if (job.detail) {
    const support = new V6SurfaceSupport(mesh.positions, mesh.indices);
    while (!support.step(128)) yield;
    chunk = { ...(yield* finishV6ChunkSteps(job.key, mesh)), support, detail: true };
  } else {
    if (!mesh.indices.length) mesh.min = mesh.max = [0, 0, 0];
    chunk = {
      key: job.key,
      mesh,
      detail: false,
      surface: { positions: mesh.positions, resources: [] },
    };
  }
  yield* prepareV6TerrainPickingSteps(mesh);
  yield;
  return chunk;
}
