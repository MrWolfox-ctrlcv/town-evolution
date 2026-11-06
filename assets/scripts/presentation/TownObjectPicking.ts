import type { geometry } from 'cc';
import type { GroundObjects } from './GroundObjects';
import type { ModelPicking } from './ModelPicking';
import { nearerHit, nearbyTouchHit, touchPickContext } from './TouchPicking';
import type { TouchCandidate, VisibleHit } from './TouchPicking';

/** All tools and object selectors agree on a single visible object for the same contact ray. */
export class TownObjectPicking {
  // A ray belongs to one synchronous input callback. MapCamera creates a fresh ray
  // for every later event; scene sync and lifting also invalidate shared results.
  private cache = new WeakMap<geometry.Ray, Map<string, VisibleHit | null>>();
  constructor(
    private readonly resources: () => GroundObjects,
    private readonly buildingHit: (
      ray: geometry.Ray,
      exclude?: string,
    ) => { id: string; distance: number } | null,
    private readonly buildingSurfaces: () => Iterable<{ id: string; surface: ModelPicking }>,
    private readonly terrainDistance?: (ray: geometry.Ray) => number | null,
    private readonly usable?: (hit: VisibleHit) => boolean,
  ) {}
  clear(): void {
    this.cache = new WeakMap();
  }
  hit(ray: geometry.Ray, exclude?: string): VisibleHit | null {
    const context = touchPickContext(ray),
      key = exclude ?? '';
    const cached = context ? this.cache.get(ray) : undefined;
    if (cached?.has(key)) return cached.get(key)!;
    const ground = this.resources(),
      building = this.buildingHit(ray, exclude),
      tree = ground.pickTree(ray),
      pile = ground.pickStack(ray, exclude),
      natural = ground.pickNatural(ray),
      drop = ground.pickDrop?.(ray);
    let hit: VisibleHit | null = null;
    if (building) hit = { kind: 'building', ...building };
    if (tree) hit = nearerHit(hit, { kind: 'tree', ...tree });
    if (pile) hit = nearerHit(hit, { kind: 'pile', ...pile });
    if (natural) hit = nearerHit(hit, { kind: 'natural', ...natural });
    if (drop) hit = nearerHit(hit, { kind: 'drop', ...drop });
    const groundDistance = this.terrainDistance?.(ray);
    if (hit && groundDistance != null && hit.distance > groundDistance + 0.015) hit = null;
    // Any exact center hit wins, even when it is not usable by the current tool.
    if (!hit && context) {
      const candidates: TouchCandidate[] = ground.touchCandidates(context, exclude);
      for (const building of this.buildingSurfaces())
        if (building.id !== exclude && building.surface.nearScreen(context))
          candidates.push({
            pick: (sample) => {
              const distance = building.surface.distance(sample);
              return distance === null ? null : { kind: 'building', id: building.id, distance };
            },
          });
      hit = nearbyTouchHit(
        context,
        candidates.map((candidate) => ({
          ...candidate,
          pick: (sample) => {
            const result = candidate.pick(sample),
              ground = this.terrainDistance?.(sample);
            return result && ground != null && result.distance > ground + 0.015 ? null : result;
          },
        })),
      );
    }
    if (hit && this.usable && !this.usable(hit)) hit = null;
    if (context) {
      const entries = cached ?? new Map<string, VisibleHit | null>();
      entries.set(key, hit);
      this.cache.set(ray, entries);
    }
    return hit;
  }
}
