const { parentPort } = require('node:worker_threads');
const { V6WorkerRuntime } = require('../../.domain-build/application/V6WorkerRuntime');
const runtime = new V6WorkerRuntime((message, transfer) => {
  parentPort.postMessage(message, transfer);
  if (message.kind === 'complete')
    parentPort.postMessage({
      kind: 'transfer-observation',
      bytes: transfer.map((b) => b.byteLength),
    });
}, setImmediate);
parentPort.on('message', (message) => runtime.receive(message));
