import { V6_GENERATOR_REVISION } from '../domain/v6-contracts';
import type { BuildProgress } from '../domain/v6-terrain-builder';
export const V6_WORKER_PROTOCOL = 'terrain6-worker-1';
export interface V6WorkerEnvelope {
  protocol: typeof V6_WORKER_PROTOCOL;
  revision: typeof V6_GENERATOR_REVISION;
  requestId: number;
  seed: number;
}
export interface V6WorkerRequest extends V6WorkerEnvelope {
  kind: 'prepare' | 'cancel';
}
export type V6WorkerReply = V6WorkerEnvelope &
  (
    | { kind: 'progress'; progress: BuildProgress }
    | { kind: 'complete'; data: unknown }
    | { kind: 'failed' }
  );
export function v6WorkerEnvelope(requestId: number, seed: number): V6WorkerEnvelope {
  return { protocol: V6_WORKER_PROTOCOL, revision: V6_GENERATOR_REVISION, requestId, seed };
}
export function isV6WorkerEnvelope(value: unknown): value is V6WorkerEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<V6WorkerEnvelope>;
  return (
    v.protocol === V6_WORKER_PROTOCOL &&
    v.revision === V6_GENERATOR_REVISION &&
    Number.isSafeInteger(v.requestId) &&
    v.requestId! > 0 &&
    Number.isSafeInteger(v.seed) &&
    v.seed! >= 1 &&
    v.seed! <= 1_000_000_000
  );
}
/** Small adapter allows browser Worker and real node:worker_threads tests to share one client. */
export interface V6WorkerPort {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(message: V6WorkerRequest): void;
  terminate(): void;
}
export type V6WorkerFactory = () => V6WorkerPort;
const stages = new Set([
  'hydrology',
  'coast-candidates',
  'coast-sort',
  'coast-certify',
  'starter-candidates',
  'starter-sort',
  'starter-trees',
  'reserve-bounds',
  'allocate-lattice',
  'clear-lattice',
  'cell-vertices',
  'cell-strata',
  'cell-finalize',
  'initial-resources',
  'initial-trees',
  'transfer-validate',
  'complete',
]);
export function isV6WorkerProgress(value: unknown, seed: number): value is BuildProgress {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<BuildProgress>;
  return (
    p.seed === seed &&
    p.status === 'building' &&
    stages.has(p.stage ?? '') &&
    Number.isSafeInteger(p.completedWork) &&
    p.completedWork! >= 0 &&
    Number.isSafeInteger(p.stepWork) &&
    p.stepWork! >= 0 &&
    p.stepWork! <= 1024
  );
}
