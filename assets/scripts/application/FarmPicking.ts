import type { Building } from '../domain/types';
import { farmCellCenter } from './FarmCells';
import { growthStage } from '../art/CropGrowth';
import { ASSETS } from '../art/AssetCatalog';
import { compileAsset } from '../art/MeshCompiler';
type Point = { x: number; y: number; z: number };
const heights = new Map<string, number>();
/** Hit the visible crop volume, not its projection onto soil behind it. */
export function pickFarmCrop(
  buildings: readonly Building[],
  ray: { o: Point; d: Point },
  now: number,
) {
  let best: { buildingId: string; cell: number; distance: number } | null = null;
  for (const b of buildings) {
    if (b.kind !== 'farm') continue;
    for (let cell = 0; cell < 9; cell++) {
      const job = b.cropJobs?.[cell];
      if (!job) continue;
      const key = `crop-cell-${job.crop ?? 'vegetable'}-${growthStage(job, now)}`;
      let height = heights.get(key);
      if (height === undefined) {
        height = compileAsset(ASSETS[key]!).max[1]! + 0.04;
        heights.set(key, height);
      }
      const center = farmCellCenter(b, cell);
      let near = 0,
        far = Infinity;
      for (const [axis, lo, hi] of [
        ['x', center.x - 0.31, center.x + 0.31],
        ['y', 0.17, height],
        ['z', center.z - 0.31, center.z + 0.31],
      ] as const) {
        const origin = ray.o[axis],
          direction = ray.d[axis];
        if (Math.abs(direction) < 1e-9) {
          if (origin < lo || origin > hi) far = -1;
          continue;
        }
        const a = (lo - origin) / direction,
          c = (hi - origin) / direction;
        near = Math.max(near, Math.min(a, c));
        far = Math.min(far, Math.max(a, c));
      }
      if (far >= near && (!best || near < best.distance))
        best = { buildingId: b.id, cell, distance: near };
    }
  }
  return best;
}
