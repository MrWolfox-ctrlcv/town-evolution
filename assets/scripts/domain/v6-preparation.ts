import { V6TerrainBuilder } from './v6-terrain-builder';
import type { BuildProgress, PreparedV6World } from './v6-terrain-builder';
import { getPreparedV6World, hasPreparedV6World, publishPreparedV6World } from './v6-world';
export type { BuildProgress, BuildStatus, PreparedV6World } from './v6-terrain-builder';
/** UI schedules deterministic work. No partial world or GameState is ever published. */
export class V6WorldPreparation {
  readonly #builder: V6TerrainBuilder | undefined;
  #cached: PreparedV6World | undefined;
  #cachedStatus: BuildProgress['status'] = 'ready';
  constructor(readonly seed: number) {
    if (hasPreparedV6World(seed)) this.#cached = getPreparedV6World(seed);
    else this.#builder = new V6TerrainBuilder(seed);
  }
  get progress(): BuildProgress {
    return (
      this.#builder?.progress ??
      Object.freeze({
        status: this.#cachedStatus,
        seed: this.seed,
        stage: 'complete',
        completedWork: 0,
        stepWork: 0,
      })
    );
  }
  step(maxWork: number): BuildProgress {
    if (!Number.isSafeInteger(maxWork) || maxWork < 1 || maxWork > 1_000_000)
      throw Error('Invalid v6 work budget');
    return this.#builder?.step(maxWork) ?? this.progress;
  }
  cancel(): boolean {
    if (this.#builder) return this.#builder.cancel();
    if (this.#cachedStatus !== 'ready') return false;
    this.#cached = undefined;
    this.#cachedStatus = 'cancelled';
    return true;
  }
  takeResult(): PreparedV6World {
    let result: PreparedV6World;
    if (this.#builder) result = this.#builder.takeResult();
    else {
      if (this.#cachedStatus !== 'ready' || !this.#cached)
        throw Error('No complete unconsumed v6 world');
      result = this.#cached;
      this.#cached = undefined;
      this.#cachedStatus = 'consumed';
    }
    publishPreparedV6World(result);
    return result;
  }
}
