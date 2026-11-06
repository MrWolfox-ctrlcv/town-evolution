import type { WorldBoxTest } from '../application/WorldVisibility';
import type { Material, MeshRenderer } from 'cc';
import type { GameState } from '../domain/types';
import { getV6EditSurface } from '../domain/v6-edit-surface';
import type { NaturalSurfaceData } from '../art/NaturalSurfaceData';
import { createV6CoastSource, v5CoastChunkBounds } from '../art/V6Coast';
import { V6SurfaceBudgetError } from '../art/V6SurfaceBudget';
import { V6SurfaceChunks } from '../art/V6SurfaceChunks';
import type { V6SurfaceTransaction } from '../art/V6SurfaceChunks';
import { V6TerrainPicking } from '../application/V6TerrainPicking';
import type { SurfaceRay } from '../application/NaturalPicking';
import { V6ChunkMeshes } from './V6ChunkMeshes';
import type { CoastalWaterMotion } from './CoastalWaterMotion';
import type { DropSupport } from './DropSupport';
/** All ground authorities travel in one transaction. Hidden uploads are never pickable. */
export class V6IslandView {
  naturalSurface: NaturalSurfaceData = { positions: [], resources: [], chunks: [] };
  private state: GameState | null = null;
  private source: ReturnType<typeof getV6EditSurface> | null = null;
  private coast: ReturnType<typeof createV6CoastSource> | null = null;
  private chunks: V6SurfaceChunks | null = null;
  private meshes: V6ChunkMeshes | null = null;
  private pending: V6SurfaceTransaction | null = null;
  private failure: unknown = null;
  private failureView = '';
  private constrained = false;
  private requestedOverview = 0;
  private picker = new V6TerrainPicking();
  private requestedFine = new Set<string>();
  constructor(
    private renderer: MeshRenderer,
    private waterRenderer: MeshRenderer,
    private material: Material,
    private waterMotion: CoastalWaterMotion,
    private support: DropSupport,
  ) {}
  sync(state: GameState): void {
    if (this.state?.mapSeed !== state.mapSeed || !this.chunks) {
      this.dispose();
      this.source = getV6EditSurface(state);
      this.coast = createV6CoastSource(this.source.world, state.landExtensions);
      this.chunks = new V6SurfaceChunks(
        this.source,
        this.coast,
        undefined,
        new Set(state.trees.map((t) => `${t.x},${t.z}`)),
      );
      this.meshes = new V6ChunkMeshes(this.renderer.node, this.material);
      this.waterMotion.configure(this.waterRenderer, this.coast.water, state.mapSeed);
    } else if (this.state !== state) {
      const before = this.state!,
        changed = new Map<string, { x: number; z: number }>();
      const compare = (
        a: readonly { x: number; z: number }[],
        b: readonly { x: number; z: number }[],
      ) => {
        const old = new Map(a.map((p) => [`${p.x},${p.z}`, JSON.stringify(p)])),
          next = new Map(b.map((p) => [`${p.x},${p.z}`, JSON.stringify(p)]));
        for (const p of [...a, ...b])
          if (old.get(`${p.x},${p.z}`) !== next.get(`${p.x},${p.z}`))
            changed.set(`${p.x},${p.z}`, p);
      };
      compare(before.naturalResources, state.naturalResources);
      if (before.trees !== state.trees) {
        compare(
          before.trees.map((t) => ({ x: t.x, z: t.z })),
          state.trees.map((t) => ({ x: t.x, z: t.z })),
        );
        this.chunks.setVisualCells(new Set(state.trees.map((t) => `${t.x},${t.z}`)));
      }
      compare(before.terrain6?.cells ?? [], state.terrain6?.cells ?? []);
      const topology =
        JSON.stringify(before.landExtensions) !== JSON.stringify(state.landExtensions);
      compare(before.landExtensions, state.landExtensions);
      if (changed.size) {
        this.source = getV6EditSurface(state);
        if (topology)
          this.coast = createV6CoastSource(
            this.source.world,
            state.landExtensions,
            this.coast!.water,
          );
        this.chunks.update(this.source, [...changed.values()], topology ? this.coast! : undefined);
        this.meshes!.cancel();
        this.pending = null;
        this.failure = null;
      }
    }
    this.state = state;
    this.support.setFarms(state.buildings, (b) => b.baseElevation ?? this.elevation(b.x, b.z));
  }
  private elevation(x: number, z: number): number {
    return this.source?.heightInCell(x + 0.5, z + 0.5, x, z) ?? 0;
  }
  frame(
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    budget: { maxPatchBuilds?: number; maxMilliseconds?: number; maxUploadBytes?: number } = {},
    visible?: WorldBoxTest,
    _lodSpan?: number,
    maxError = 0,
    overviewError = 0,
  ): boolean {
    if (
      !this.chunks ||
      !this.meshes ||
      !this.coast ||
      !Object.values(bounds).every(Number.isFinite)
    )
      return false;
    const initial = !this.surfaceStatus().overviewVisible;
    if (initial && overviewError <= 0) return false;
    const farError = Math.max(0, Math.min(0.25, overviewError));
    const cx = initial ? 96 : (bounds.minX + bounds.maxX) / 2;
    const cz = initial ? 96 : (bounds.minZ + bounds.maxZ) / 2;
    const keys = this.coast.keys.filter((key) => {
      if (!this.constrained) return true;
      const [x, z, xx, zz] = v5CoastChunkBounds(key);
      return xx >= bounds.minX && x <= bounds.maxX && zz >= bounds.minZ && z <= bounds.maxZ;
    });
    this.requestedOverview = keys.length;
    const fine =
      initial || (maxError > 0 && maxError >= farError)
        ? []
        : keys.filter((key) => {
            const [x, z, xx, zz] = v5CoastChunkBounds(key);
            if (xx < bounds.minX || x > bounds.maxX || zz < bounds.minZ || z > bounds.maxZ)
              return false;
            const chunk = this.chunks!.resident().get(key);
            if (!visible || !chunk || !chunk.mesh.indices.length) return true;
            const { min, max } = chunk.mesh;
            return visible(
              { x: min[0]!, y: min[1]! - 0.25, z: min[2]! },
              { x: max[0]!, y: max[1]! + 0.25, z: max[2]! },
            );
          });
    this.requestedFine = new Set(fine);
    keys.sort((a, b) => {
      const [x, z] = v5CoastChunkBounds(a),
        [xx, zz] = v5CoastChunkBounds(b);
      return Math.hypot(x + 8 - cx, z + 8 - cz) - Math.hypot(xx + 8 - cx, zz + 8 - cz);
    });
    const view = JSON.stringify([bounds, fine]);
    if (this.failure && view === this.failureView) return false;
    this.failure = null;
    this.chunks.request(keys, fine, farError);
    if (this.pending && !this.chunks.isCurrent(this.pending)) {
      this.meshes.cancel();
      this.pending = null;
    }
    try {
      const tx = this.chunks.advance(budget.maxPatchBuilds ?? 512, budget.maxMilliseconds ?? 3);
      if (!tx) return false;
      if (tx !== this.pending) {
        this.meshes.stage(tx.chunks);
        this.pending = tx;
      }
      if (
        !this.meshes.advance(
          Math.max(0, budget.maxUploadBytes ?? 262144),
          budget.maxMilliseconds ?? 3,
        )
      )
        return false;
      // Prepare support before committing. Exceptions leave the previous complete view intact.
      this.support.setNaturalChunks(tx.chunks);
      this.naturalSurface = tx.commit();
      this.picker.sync(this.chunks.resident().values());
      this.meshes.publish();
      this.pending = null;
      return true;
    } catch (error) {
      this.meshes.cancel();
      this.pending = null;
      this.chunks.abort();
      this.failure = error;
      this.constrained = true;
      this.failureView = view;
      console.warn('Terrain6 surface staging stopped; previous complete snapshot retained', error);
      return false;
    }
  }
  pickTerrain(ray: SurfaceRay) {
    const hit = this.picker.pick(ray);
    return hit && this.isGroundReady(hit.x, hit.z) ? hit : null;
  }
  terrainDistance(ray: SurfaceRay): number | null {
    return this.picker.pick(ray)?.distance ?? null;
  }
  surfaceStatus() {
    const live = this.chunks?.resident();
    const overviewVisible = !!live && [...live.values()].some((c) => c.mesh.indices.length > 0);
    const overview = !this.requestedFine.size || !live || live.size < this.requestedOverview;
    const ready = this.chunks?.isSettled() ?? false;
    return {
      overviewVisible,
      overviewComplete:
        !!live && this.requestedOverview > 0 && live.size === this.requestedOverview,
      phase: overview ? ('overview' as const) : ready ? ('ready' as const) : ('detail' as const),
      readyChunks: overview
        ? (live?.size ?? 0)
        : [...this.requestedFine].filter((k) => live?.get(k)?.detail).length,
      requestedChunks: overview ? this.requestedOverview : this.requestedFine.size,
    };
  }
  isGroundVisible(x: number, z: number): boolean {
    return !this.failure && (this.chunks?.visible(x, z) ?? false);
  }
  isGroundReady(x: number, z: number): boolean {
    return !this.failure && (this.chunks?.ready(x, z) ?? false);
  }
  surfaceProblem(): string | null {
    return this.failure instanceof V6SurfaceBudgetError
      ? this.failure.message
      : this.failure
        ? '地形加载失败，请缩小视域后重试'
        : null;
  }
  isLoading(): boolean {
    return !this.failure && !!this.chunks && !this.chunks.isSettled();
  }
  dispose(): void {
    this.constrained = false;
    this.requestedOverview = 0;
    this.meshes?.dispose();
    this.chunks?.dispose();
    this.meshes = null;
    this.chunks = null;
    this.pending = null;
    this.source = null;
    this.coast = null;
    this.state = null;
    this.failure = null;
    this.requestedFine.clear();
    this.naturalSurface = { positions: [], resources: [], chunks: [] };
    this.picker.sync([]);
    this.support.clearNaturalChunks();
    this.support.clearCoastChunks();
  }
}
