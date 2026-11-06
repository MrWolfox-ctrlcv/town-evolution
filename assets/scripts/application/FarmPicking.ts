import { farmCellCount } from '../domain/farming';
import type { Building } from '../domain/types';
import { farmCellAtHit, farmCellCenter } from './FarmCells';
import { growthStage } from '../art/CropGrowth';
import { ASSETS } from '../art/AssetCatalog';
import { compileAsset } from '../art/MeshCompiler';
type Point = { x: number; y: number; z: number };
const heights = new Map<string, number>();
/** Coarse harvest aid for air gaps; resolve actual visible surfaces before using it. */
export function pickFarmCrop(
  buildings: readonly Building[],
  ray: { o: Point; d: Point },
  now: number,
) {
  let best: { buildingId: string; cell: number; distance: number } | null = null;
  for (const b of buildings) {
    if (b.kind !== 'farm') continue;
    for (let cell = 0; cell < farmCellCount(b); cell++) {
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
        ['y', (b.baseElevation ?? 0) + 0.17, (b.baseElevation ?? 0) + height],
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

/** The presentation supplies the nearest actual surface, including opaque blockers. */
export interface FarmToolSurface {
  buildingId: string | null;
  cell: number | null;
  soil: boolean;
  distance: number;
}
/** Resolve precise crop identity, bounded air-gap forgiveness and soil in one query result. */
export function resolveHarvestHit(
  buildings: readonly Building[],
  ray: { o: Point; d: Point },
  visible: FarmToolSurface | null,
  now: number,
) {
  if (!visible?.buildingId) return null;
  // A visible crop always wins, including an immature crop or one just cut in this batch.
  // Its old mesh stays visible until refresh; never cut through it into another cell.
  if (visible.cell !== null)
    return { buildingId: visible.buildingId, cell: visible.cell, distance: visible.distance };
  if (!visible.soil) return null;
  const farm = buildings.find((b) => b.id === visible.buildingId && b.kind === 'farm');
  if (!farm) return null;
  // Air-gap forgiveness is limited to the same visible bed. A crop's empty bounding volume
  // cannot hide another visible crop, a different farm, an attachment, or any foreground object.
  const crop = pickFarmCrop([farm], ray, now);
  if (crop && crop.distance <= visible.distance) return crop;
  // Keep direct soil sweeps usable without repeating the full scene's triangle query.
  const cell = farmCellAtHit(farm, ray, visible.distance);
  return cell === null ? null : { buildingId: farm.id, cell, distance: visible.distance };
}
