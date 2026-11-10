import { V6WorldPreparation } from '../domain/v6-preparation';
import { V6TerrainBuilder } from '../domain/v6-terrain-builder';
import { hasPreparedV6World, publishPreparedV6World } from '../domain/v6-world';
import type { BuildProgress, PreparedV6World } from '../domain/v6-terrain-builder';
import { isV6WorkerEnvelope, isV6WorkerProgress, v6WorkerEnvelope } from './V6WorkerProtocol';
import type { V6WorkerFactory, V6WorkerPort, V6WorkerReply } from './V6WorkerProtocol';
let factory: V6WorkerFactory | null = null;
let sequence = 0;
/** Only builds that ship a worker asset opt in. Creator/native safely keep cooperative work. */
export function configureV6WorkerFactory(value: V6WorkerFactory | null): void {
  factory = value;
}
export interface V6PreparationJob {
  readonly waiting?: boolean;
  readonly mode?: 'worker' | 'hydrate' | 'fallback';
  step(maxWork: number): BuildProgress;
  takeResult(): PreparedV6World;
  cancel(): boolean;
}
export function createV6Preparation(seed: number): V6PreparationJob {
  return factory && !hasPreparedV6World(seed)
    ? new V6WorkerPreparation(seed, factory)
    : new V6WorldPreparation(seed);
}
/** Events only queue data. Validation/publication run inside the UI's cancellable frame budget. */
export class V6WorkerPreparation implements V6PreparationJob {
  private port: V6WorkerPort | null = null;
  private local: V6TerrainBuilder | V6WorldPreparation | null = null;
  private pending: unknown;
  private received = false;
  private broken = false;
  private terminal = false;
  private lastActivity: number;
  private progress: BuildProgress;
  private readonly requestId = ++sequence;
  mode: 'worker' | 'hydrate' | 'fallback' = 'worker';
  constructor(
    readonly seed: number,
    makeWorker: V6WorkerFactory,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!Number.isSafeInteger(seed) || seed < 1 || seed > 1_000_000_000)
      throw Error('Invalid v6 seed');
    this.lastActivity = this.clock();
    this.progress = { seed, status: 'building', stage: 'hydrology', completedWork: 0, stepWork: 0 };
    try {
      const port = (this.port = makeWorker());
      port.onmessage = ({ data }) => {
        if (this.terminal || this.port !== port || this.received) return;
        // Old jobs cannot replace or fail this job; malformed replies for this job fail closed.
        if (
          data &&
          typeof data === 'object' &&
          'requestId' in data &&
          data.requestId !== this.requestId
        )
          return;
        if (
          !isV6WorkerEnvelope(data) ||
          data.requestId !== this.requestId ||
          data.seed !== seed ||
          !('kind' in data)
        ) {
          this.broken = true;
          return;
        }
        const reply = data as V6WorkerReply;
        if (
          reply.kind === 'progress' &&
          isV6WorkerProgress(reply.progress, seed) &&
          reply.progress.completedWork >= this.progress.completedWork
        ) {
          this.progress = reply.progress;
          this.lastActivity = this.clock();
        } else if (reply.kind === 'complete') {
          this.received = true;
          this.pending = reply.data;
          this.close();
        } else this.broken = true;
      };
      port.onerror = port.onmessageerror = () => {
        if (!this.terminal && this.port === port) this.broken = true;
      };
      port.postMessage({ ...v6WorkerEnvelope(this.requestId, seed), kind: 'prepare' });
    } catch {
      this.broken = true;
    }
  }
  get waiting(): boolean {
    return !this.local && !this.received && !this.broken && !this.terminal;
  }
  private close(): void {
    const port = this.port;
    this.port = null;
    if (port) {
      port.onmessage = port.onerror = port.onmessageerror = null;
      try {
        port.terminate();
      } catch {
        /* Already stopped; late events remain invalidated. */
      }
    }
  }
  private fallback(): void {
    this.close();
    this.pending = undefined;
    this.received = false;
    this.local?.cancel();
    this.local = new V6WorldPreparation(this.seed);
    this.mode = 'fallback';
    this.broken = false;
  }
  step(maxWork: number): BuildProgress {
    if (!Number.isSafeInteger(maxWork) || maxWork < 1 || maxWork > 1_000_000)
      throw Error('Invalid v6 work budget');
    if (this.terminal) return this.progress;
    if (
      this.mode === 'worker' &&
      (this.broken || (!this.received && this.clock() - this.lastActivity > 30_000))
    )
      this.fallback();
    if (this.received && !this.local) {
      this.local = V6TerrainBuilder.fromTransfer(this.seed, this.pending);
      this.pending = undefined;
      this.mode = 'hydrate';
    }
    if (this.local) {
      try {
        this.progress = this.local.step(maxWork);
      } catch (error) {
        if (this.mode !== 'hydrate') throw error;
        this.fallback();
        this.progress = this.local!.step(maxWork);
      }
    }
    return this.progress;
  }
  takeResult(): PreparedV6World {
    if (this.terminal || !this.local || this.progress.status !== 'ready')
      throw Error('No complete unconsumed v6 world');
    const result = this.local.takeResult();
    if (this.mode === 'hydrate') publishPreparedV6World(result);
    this.terminal = true;
    this.progress = { ...this.progress, status: 'consumed', stepWork: 0 };
    this.local = null;
    this.close();
    return result;
  }
  cancel(): boolean {
    if (this.terminal) return false;
    this.terminal = true;
    this.local?.cancel();
    this.local = null;
    this.pending = undefined;
    this.progress = { ...this.progress, status: 'cancelled', stepWork: 0 };
    this.close();
    return true;
  }
}
