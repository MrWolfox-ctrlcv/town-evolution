import { V6WorkerRuntime } from '../../assets/scripts/application/V6WorkerRuntime';
// Bundled separately as a classic worker. No Cocos runtime or page/storage APIs are imported.
const scope = globalThis as unknown as {
  postMessage(message: unknown, transfer: ArrayBuffer[]): void;
  onmessage: (event: { data: unknown }) => void;
};
// MessageChannel avoids nested setTimeout's browser minimum-delay clamp between batches.
const queue: (() => void)[] = [];
const channel = new MessageChannel();
channel.port1.onmessage = () => queue.shift()?.();
const runtime = new V6WorkerRuntime(
  (message, transfer) => scope.postMessage(message, transfer),
  (run) => {
    queue.push(run);
    channel.port2.postMessage(null);
  },
);
scope.onmessage = ({ data }) => runtime.receive(data);
