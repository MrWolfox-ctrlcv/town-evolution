import { V5CoastChunks } from '../art/V5CoastChunks';
import type { V5CoastTransaction } from '../art/V5CoastChunks';
import type { GameState } from '../domain/types';
import type { NaturalSurfaceData } from '../art/NaturalSurfaceData';
import { createV5CoastSource, v5CoastChunkBounds } from '../art/V5Coast';
import { V5ResourceChunks } from '../art/V5ResourceChunks';
import type { V5ResourceTransaction } from '../art/V5ResourceChunks';
import { V5ChunkMeshes } from './V5ChunkMeshes';
import type { MeshRenderer, Material } from 'cc';
import type { CoastalWaterMotion } from './CoastalWaterMotion';
import type { DropSupport } from './DropSupport';
export class V5IslandView {
  naturalSurface: NaturalSurfaceData = { positions: [], resources: [], chunks: [] };
  private v5Resources: V5ResourceChunks | null = null;
  private v5ResourceMeshes: V5ChunkMeshes | null = null;
  private v5Pending: V5ResourceTransaction | null = null;
  private v5State: GameState | null = null;
  private v5Topology = '';
  private v5Failure: unknown = null;
  private v5Coast: ReturnType<typeof createV5CoastSource> | null = null;
  private v5CoastMeshes: V5ChunkMeshes | null = null;
  private v5CoastChunks: V5CoastChunks | null = null;
  private v5CoastPending: V5CoastTransaction | null = null;

  constructor(
    private terrainRenderer: MeshRenderer,
    private coastRenderer: MeshRenderer,
    private waterRenderer: MeshRenderer,
    private material: Material,
    private waterMotion: CoastalWaterMotion,
    private dropSupport: DropSupport,
  ) {}
  sync(state: GameState): void {
    this.dropSupport.setFarms(state.buildings);
    const topology = JSON.stringify([state.mapSeed, state.landExtensions]);
    if (this.v5State?.mapSeed !== state.mapSeed || !this.v5Resources) {
      this.dispose();
      this.v5Topology = topology;
      this.v5Coast = createV5CoastSource(state.mapSeed, state.landExtensions);
      this.v5CoastChunks = new V5CoastChunks(this.v5Coast);
      this.v5CoastMeshes = new V5ChunkMeshes(this.coastRenderer.node, this.material);
      this.waterMotion.configure(this.waterRenderer, this.v5Coast.water, state.mapSeed);
      this.v5Resources = new V5ResourceChunks(state.mapSeed);
      this.v5ResourceMeshes = new V5ChunkMeshes(this.terrainRenderer.node, this.material);
      this.naturalSurface = { positions: [], resources: [], chunks: [] };
    }
    if (topology !== this.v5Topology) {
      const before = new Map((this.v5State?.landExtensions ?? []).map((p) => [`${p.x},${p.z}`, p])),
        after = new Map(state.landExtensions.map((p) => [`${p.x},${p.z}`, p])),
        changed = [
          ...[...before].filter(([key]) => !after.has(key)).map(([, p]) => p),
          ...[...after].filter(([key]) => !before.has(key)).map(([, p]) => p),
        ];
      if (changed.length) {
        this.v5Coast = createV5CoastSource(state.mapSeed, state.landExtensions);
        this.v5CoastChunks!.update(this.v5Coast, changed);
        this.v5CoastMeshes!.cancel();
        this.v5CoastPending = null;
      }
      this.v5Topology = topology;
    }
    this.v5State = state;
    this.v5Resources.update(state.naturalResources);
    if (this.v5Pending && !this.v5Resources.isCurrent(this.v5Pending)) {
      this.v5ResourceMeshes!.cancel();
      this.v5Pending = null;
    }
  }
  /** Cocos tick integration: real patch work and bounded-size hidden mesh uploads.
   * Browser workers and device/GPU frame-time approval remain separate gates. */
  frame(
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    budget: { maxPatchBuilds?: number; maxMilliseconds?: number; maxUploadBytes?: number } = {},
  ): boolean {
    if (!this.v5State || !this.v5Resources || !this.v5ResourceMeshes || this.v5Failure)
      return false;
    if (!Object.values(bounds).every(Number.isFinite)) return false;
    const coastChanged = this.advanceV5Coast(bounds, budget);
    const keys: string[] = [];
    for (
      let z = Math.max(0, Math.floor(bounds.minZ / 16) - 1);
      z <= Math.min(11, Math.floor(bounds.maxZ / 16) + 1);
      z++
    )
      for (
        let x = Math.max(0, Math.floor(bounds.minX / 16) - 1);
        x <= Math.min(11, Math.floor(bounds.maxX / 16) + 1);
        x++
      )
        keys.push(`${x},${z}`);
    const centerX = (bounds.minX + bounds.maxX) / 2,
      centerZ = (bounds.minZ + bounds.maxZ) / 2;
    keys.sort((a, b) => {
      const [x, z] = a.split(',').map(Number),
        [xx, zz] = b.split(',').map(Number);
      return (
        Math.hypot(x! * 16 + 8 - centerX, z! * 16 + 8 - centerZ) -
        Math.hypot(xx! * 16 + 8 - centerX, zz! * 16 + 8 - centerZ)
      );
    });
    this.v5Resources.request(keys);
    if (this.v5Pending && !this.v5Resources.isCurrent(this.v5Pending)) {
      this.v5ResourceMeshes.cancel();
      this.v5Pending = null;
    }
    try {
      const transaction = this.v5Resources.advance(
        budget.maxPatchBuilds ?? 8,
        budget.maxMilliseconds ?? 3,
      );
      if (!transaction) return coastChanged;
      if (transaction !== this.v5Pending) {
        this.v5ResourceMeshes.stage(transaction.chunks);
        this.v5Pending = transaction;
      }
      if (
        !this.v5ResourceMeshes.advance(
          Math.max(65536, budget.maxUploadBytes ?? 262144),
          budget.maxMilliseconds ?? 3,
        )
      )
        return coastChanged;
      this.dropSupport.setNaturalChunks(transaction.chunks);
      this.naturalSurface = transaction.commit();
      this.v5ResourceMeshes.publish();
      this.v5Pending = null;
      return true;
    } catch (error) {
      this.v5ResourceMeshes.cancel();
      this.v5Pending = null;
      this.v5Failure = error;
      console.warn('V5 terrain staging stopped; previous complete snapshot retained', error);
      return coastChanged;
    }
  }
  private advanceV5Coast(
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    budget: { maxMilliseconds?: number; maxUploadBytes?: number },
  ): boolean {
    if (!this.v5Coast || !this.v5CoastMeshes || !this.v5CoastChunks) return false;
    const cx = (bounds.minX + bounds.maxX) / 2,
      cz = (bounds.minZ + bounds.maxZ) / 2;
    const wanted = this.v5Coast.keys
      .filter((key) => {
        const [x, z, xx, zz] = v5CoastChunkBounds(key);
        return (
          xx >= bounds.minX - 16 &&
          x <= bounds.maxX + 16 &&
          zz >= bounds.minZ - 16 &&
          z <= bounds.maxZ + 16
        );
      })
      .sort((a, b) => {
        const [x, z] = v5CoastChunkBounds(a),
          [xx, zz] = v5CoastChunkBounds(b);
        return Math.hypot(x + 8 - cx, z + 8 - cz) - Math.hypot(xx + 8 - cx, zz + 8 - cz);
      });
    this.v5CoastChunks.request(wanted);
    if (this.v5CoastPending && !this.v5CoastChunks.isCurrent(this.v5CoastPending)) {
      this.v5CoastMeshes.cancel();
      this.v5CoastPending = null;
    }
    try {
      const transaction = this.v5CoastChunks.advance(64, budget.maxMilliseconds ?? 3);
      if (!transaction) return false;
      if (transaction !== this.v5CoastPending) {
        this.v5CoastMeshes.stage(transaction.chunks);
        this.v5CoastPending = transaction;
      }
      if (
        !this.v5CoastMeshes.advance(
          Math.max(65536, budget.maxUploadBytes ?? 262144),
          budget.maxMilliseconds ?? 3,
        )
      )
        return false;
      this.dropSupport.setCoastChunks(transaction.chunks);
      transaction.commit();
      this.v5CoastMeshes.publish();
      this.v5CoastPending = null;
      return true;
    } catch (error) {
      this.v5CoastMeshes.cancel();
      this.v5CoastPending = null;
      this.v5Failure = error;
      console.warn('V5 coast staging stopped; prior chunks retained', error);
      return false;
    }
  }
  isGroundReady(x: number, z: number): boolean {
    return (
      this.v5CoastChunks?.resident().has(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? false
    );
  }
  isLoading(): boolean {
    return (
      (!!this.v5Resources && !this.v5Resources.isSettled()) ||
      (!!this.v5CoastChunks && !this.v5CoastChunks.isSettled())
    );
  }
  dispose(): void {
    this.v5CoastMeshes?.dispose();
    this.v5CoastMeshes = null;
    this.v5Coast = null;
    this.v5CoastPending = null;
    this.v5CoastChunks?.dispose();
    this.v5CoastChunks = null;
    this.dropSupport.clearCoastChunks();
    this.v5ResourceMeshes?.dispose();
    this.v5ResourceMeshes = null;
    this.v5Resources?.dispose();
    this.v5Resources = null;
    this.v5Pending = null;
    this.v5State = null;
    this.v5Topology = '';
    this.v5Failure = null;
    this.dropSupport.clearNaturalChunks();
  }
}
