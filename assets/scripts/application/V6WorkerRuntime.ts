import { buildTerrainData } from '../domain/v6-build-terrain';
import { v6TransferBuffers } from '../domain/v6-terrain-data';
import { isV6WorkerEnvelope } from './V6WorkerProtocol';
import type { V6WorkerReply, V6WorkerRequest } from './V6WorkerProtocol';
/** Worker-only scheduler: no Cocos, storage, GameState or main-thread cache access. */
export class V6WorkerRuntime {
  private generation = 0;
  private active: V6WorkerRequest | null = null;
  constructor(
    private readonly post: (message: V6WorkerReply, transfer: ArrayBuffer[]) => void,
    private readonly schedule: (run: () => void) => void,
  ) {}
  receive(value: unknown): void {
    if (!isV6WorkerEnvelope(value) || !('kind' in value)) return;
    const request = value as V6WorkerRequest;
    if (request.kind === 'cancel') {
      if (this.active?.requestId === request.requestId && this.active.seed === request.seed) {
        this.generation++;
        this.active = null;
      }
      return;
    }
    if (request.kind !== 'prepare') return;
    const token = ++this.generation;
    this.active = request;
    const work = buildTerrainData(request.seed);
    let completedWork = 0;
    const envelope = {
      protocol: request.protocol,
      revision: request.revision,
      requestId: request.requestId,
      seed: request.seed,
    };
    const run = () => {
      if (token !== this.generation) return;
      try {
        let stage: ReturnType<typeof work.next>['value'] = 'hydrology';
        for (let step = 0; step < 1024; step++) {
          const next = work.next();
          completedWork++;
          if (next.done) {
            this.active = null;
            this.post(
              { ...envelope, kind: 'complete', data: next.value },
              v6TransferBuffers(next.value),
            );
            return;
          }
          stage = next.value;
        }
        this.post(
          {
            ...envelope,
            kind: 'progress',
            progress: {
              seed: request.seed,
              status: 'building',
              stage,
              completedWork,
              stepWork: 1024,
            },
          },
          [],
        );
        this.schedule(run);
      } catch {
        this.active = null;
        this.post({ ...envelope, kind: 'failed' }, []);
      }
    };
    this.schedule(run);
  }
}
