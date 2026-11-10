import type { MeshData } from './AssetTypes';
import type { V6CellSpan } from './V6CellSpans';
import type { V6TriangleRange } from './V6MeshUploadParts';
import { V6_UPLOAD_PART_BYTES } from './V6MeshUploadParts';
export interface V6RenderBatch {
  readonly key: string;
  /** Identity only. Never retain a mesh, span, source or previous snapshot here. */
  readonly token: object;
  readonly ranges: readonly V6TriangleRange[];
  readonly bytes: number;
  readonly parts: number;
}
interface Layout {
  batches: readonly V6RenderBatch[];
  cost: number;
}
// A CPU snapshot owns its descriptors. GPU owners keep only anonymous tokens.
const layouts = new WeakMap<MeshData, Layout>();
const wholeTokens = new WeakMap<MeshData, object>();
export const v6RenderBatchCost = (mesh: MeshData): number => layouts.get(mesh)?.cost ?? 0;
export const v6FineRenderBatches = (mesh: MeshData): readonly V6RenderBatch[] | undefined =>
  layouts.get(mesh)?.batches;
export function v6RenderBatches(mesh: MeshData): readonly V6RenderBatch[] {
  const layout = layouts.get(mesh);
  if (layout) return layout.batches;
  let token = wholeTokens.get(mesh);
  if (!token) wholeTokens.set(mesh, (token = Object.freeze({})));
  return [
    {
      key: 'whole',
      token,
      ranges: [{ start: 0, end: mesh.indices.length / 3 }],
      bytes: 0,
      parts: 0,
    },
  ];
}
const cellBatch = (x: number, z: number): string => `${Math.floor(x / 8)},${Math.floor(z / 4)}`;
/** Count the same 48-byte vertices and 16-bit indices as the uploader, without
 * allocating copied attributes. Cooperative even for deeply edited cells. */
function* measure(
  mesh: MeshData,
  ranges: readonly V6TriangleRange[],
): Generator<void, { bytes: number; parts: number }> {
  let ids = new Set<number>(),
    bytes = 0,
    total = 0,
    parts = 0,
    steps = 0;
  for (const range of ranges)
    for (let t = range.start; t < range.end; t++) {
      const tri = [mesh.indices[t * 3]!, mesh.indices[t * 3 + 1]!, mesh.indices[t * 3 + 2]!];
      let fresh = new Set(tri.filter((id) => !ids.has(id))).size;
      if (bytes + fresh * 48 + 6 > V6_UPLOAD_PART_BYTES) {
        total += bytes;
        parts++;
        ids = new Set();
        bytes = 0;
        fresh = new Set(tri).size;
      }
      for (const id of tri) ids.add(id);
      bytes += fresh * 48 + 6;
      if (++steps % 128 === 0) yield;
    }
  return { bytes: total + bytes, parts: parts + Number(bytes > 0) };
}
/** Fine-only fixed 8x4 bins; the canonical mesh and all CPU authorities stay intact. */
export function* prepareV6RenderBatches(
  mesh: MeshData,
  spans: ReadonlyMap<string, V6CellSpan>,
  coast: V6CellSpan | null,
  previous: readonly V6RenderBatch[] | undefined,
  rebuilt: readonly (readonly [number, number])[],
): Generator<void> {
  const ranges = new Map<string, V6TriangleRange[]>(),
    dirty = new Set(rebuilt.map(([x, z]) => cellBatch(x, z))),
    old = new Map(previous?.map((batch) => [batch.key, batch]));
  if (coast && coast.triangleEnd > coast.triangleStart)
    ranges.set('coast', [{ start: coast.triangleStart, end: coast.triangleEnd }]);
  for (const [key, span] of spans) {
    const [x, z] = key.split(',').map(Number),
      id = cellBatch(x!, z!);
    if (!ranges.has(id)) ranges.set(id, []);
    ranges.get(id)!.push({ start: span.triangleStart, end: span.triangleEnd });
  }
  const batches: V6RenderBatch[] = [];
  for (const [key, current] of ranges) {
    const reused = dirty.has(key) ? undefined : old.get(key),
      size = reused ?? (yield* measure(mesh, current));
    batches.push({
      key,
      ranges: current,
      token: reused?.token ?? Object.freeze({}),
      bytes: size.bytes,
      parts: size.parts,
    });
    yield;
  }
  const bytes = batches.reduce((n, batch) => n + batch.bytes, 0),
    parts = batches.reduce((n, batch) => n + batch.parts, 0),
    logicalBytes = (mesh.positions.length / 3) * 48 + mesh.indices.length * 2;
  // Snapshot descriptors, GPU entry/node bookkeeping, and actual split duplication
  // enter the existing cache/resident ledger. The same tokens may be overcharged
  // in old+new snapshots deliberately; sharing never expands the cache budget.
  const cost =
    batches.length * 512 +
    parts * 512 +
    [...ranges.values()].reduce((n, r) => n + r.length * 64, 0) +
    Math.max(0, bytes - logicalBytes) * 2;
  layouts.set(mesh, { batches, cost });
}
