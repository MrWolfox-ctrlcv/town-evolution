import { v6RenderBatchCost } from './V6RenderBatches';
import type { MeshData } from './AssetTypes';
import type { V6CellSpan } from './V6CellSpans';
export const V6_RESIDENT_ACCOUNTED_BYTES = 256 * 1024 * 1024;
/** Display-only admission limit. Never deletes edits or changes the saved world.
 * Counts CPU array capacity/index/metadata allowance, including old+staged data.
 * This is a conservative accounting bound, not a browser/GPU heap measurement. */
export class V6SurfaceBudgetError extends Error {
  constructor(
    readonly requested: number,
    readonly limit: number,
  ) {
    super('地形细节过多，请拉近或缩小视域');
    this.name = 'V6SurfaceBudgetError';
  }
}
export function v6SurfaceCost(data: MeshData | V6CellSpan): number {
  const vertices = 'mesh' in data ? data.vertexEnd - data.vertexStart : data.positions.length / 3;
  const triangles =
    'mesh' in data ? data.triangleEnd - data.triangleStart : data.indices.length / 3;
  // 2x 8-byte numerical storage capacity + triangle metadata and both picker indices.
  const cpu = (vertices * 10 + triangles * 3) * 16 + triangles * 96;
  const upload = vertices * 48 + triangles * 6;
  // Two logical upload allowances for engine host storage and GPU data. Driver,
  // allocator, trees and other actors are outside this deterministic admission ledger.
  return cpu + upload * 2 + ('mesh' in data ? 0 : v6RenderBatchCost(data));
}
export class V6SurfaceBudget {
  private live = new Map<string, number>();
  private liveBytes = 0;
  private staging = 0;
  reclaim: ((bytes: number) => void) | null = null;
  constructor(readonly limit = V6_RESIDENT_ACCOUNTED_BYTES) {
    if (!Number.isFinite(limit) || limit <= 0) throw Error('Invalid terrain6 resident budget');
  }
  reserve(bytes: number): void {
    const excess = this.liveBytes + this.staging + bytes - this.limit;
    if (excess > 0) this.reclaim?.(excess);
    const requested = this.liveBytes + this.staging + bytes;
    if (requested > this.limit) throw new V6SurfaceBudgetError(requested, this.limit);
    this.staging += bytes;
  }
  publish(key: string, bytes: number): void {
    this.liveBytes += bytes - (this.live.get(key) ?? 0);
    if (bytes) this.live.set(key, bytes);
    else this.live.delete(key);
  }
  cancel(): void {
    this.staging = 0;
  }
  usage(): { resident: number; staging: number; limit: number } {
    return { resident: this.liveBytes, staging: this.staging, limit: this.limit };
  }
  clear(): void {
    this.live.clear();
    this.liveBytes = this.staging = 0;
  }
}
