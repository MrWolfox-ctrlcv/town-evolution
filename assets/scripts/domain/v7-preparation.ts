import { V7TerrainBuilder } from './v7-terrain-builder';
import type { BuildProgress, PreparedV7World } from './v7-terrain-builder';
import { getPreparedV7World, hasPreparedV7World, publishPreparedV7World } from './v7-world';
export type { BuildProgress, BuildStatus, PreparedV7World } from './v7-terrain-builder';
/** UI schedules deterministic work. No partial world or GameState is ever published. */
export class V7WorldPreparation {
  readonly #builder: V7TerrainBuilder | undefined;
  #cached: PreparedV7World | undefined;
  #cachedStatus: BuildProgress['status'] = 'ready';
  constructor(readonly seed: number) {
    if (hasPreparedV7World(seed)) this.#cached = getPreparedV7World(seed);
    else this.#builder = new V7TerrainBuilder(seed);
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
      throw Error('Invalid v7 work budget');
    return this.#builder?.step(maxWork) ?? this.progress;
  }
  cancel(): boolean {
    if (this.#builder) return this.#builder.cancel();
    if (this.#cachedStatus !== 'ready') return false;
    this.#cached = undefined;
    this.#cachedStatus = 'cancelled';
    return true;
  }
  takeResult(): PreparedV7World {
    let result: PreparedV7World;
    if (this.#builder) result = this.#builder.takeResult();
    else {
      if (this.#cachedStatus !== 'ready' || !this.#cached)
        throw Error('No complete unconsumed v7 world');
      result = this.#cached;
      this.#cached = undefined;
      this.#cachedStatus = 'consumed';
    }
    publishPreparedV7World(result);
    return result;
  }
}
