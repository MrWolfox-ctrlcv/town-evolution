import { buildTerrain } from './v7-build-terrain';
import type { PreparedV7World } from './v7-build-terrain';

import type { Work, WorkStage } from './v6-work';
export type { PreparedV7World } from './v7-build-terrain';
const completed = new WeakSet<object>();
export function isPreparedV7World(value: unknown): value is PreparedV7World {
  return !!value && typeof value === 'object' && completed.has(value);
}
export type BuildStatus = 'building' | 'ready' | 'cancelled' | 'failed' | 'consumed';
export interface BuildProgress {
  readonly status: BuildStatus;
  readonly seed: number;
  readonly stage: WorkStage;
  readonly completedWork: number;
  readonly stepWork: number;
}
/** Pure TS cooperative initializer. No clock, browser, scheduler, game or persistence API. */
export class V7TerrainBuilder {
  #iterator: Work<PreparedV7World> | undefined;
  #result: PreparedV7World | undefined;
  #status: BuildStatus = 'building';
  #stage: WorkStage = 'hydrology';
  #completedWork = 0;
  constructor(readonly seed: number) {
    if (!Number.isSafeInteger(seed) || seed < 1 || seed > 1_000_000_000)
      throw Error('Invalid v7 seed');
    this.#iterator = buildTerrain(seed);
  }
  get progress(): BuildProgress {
    return this.describe(0);
  }
  private describe(stepWork: number): BuildProgress {
    return Object.freeze({
      status: this.#status,
      seed: this.seed,
      stage: this.#stage,
      completedWork: this.#completedWork,
      stepWork,
    });
  }
  /** maxWork bounds deterministic operations, NOT milliseconds or a frame deadline. */
  step(maxWork: number): BuildProgress {
    if (!Number.isSafeInteger(maxWork) || maxWork < 1 || maxWork > 1_000_000)
      throw Error('maxWork must be an integer from 1 to 1000000');
    if (this.#status !== 'building') return this.describe(0);
    let work = 0;
    try {
      while (work < maxWork) {
        const next = this.#iterator!.next();
        work++;
        this.#completedWork++;
        if (next.done) {
          this.#result = next.value;
          completed.add(next.value);
          this.#iterator = undefined;
          this.#status = 'ready';
          this.#stage = 'complete';
          break;
        }
        this.#stage = next.value;
      }
    } catch (error) {
      this.#iterator = undefined;
      this.#result = undefined;
      this.#status = 'failed';
      throw error;
    }
    return this.describe(work);
  }
  cancel(): boolean {
    if (this.#status !== 'building' && this.#status !== 'ready') return false;
    // Dropping the iterator releases suspended stack state and its private arrays/caches.
    this.#iterator = undefined;
    this.#result = undefined;
    this.#status = 'cancelled';
    return true;
  }
  /** Exactly once, after all stages and the complete initial snapshot are finished. */
  takeResult(): PreparedV7World {
    if (this.#status !== 'ready' || !this.#result) throw Error('No complete unconsumed v7 world');
    const result = this.#result;
    this.#result = undefined;
    this.#status = 'consumed';
    return result;
  }
}
