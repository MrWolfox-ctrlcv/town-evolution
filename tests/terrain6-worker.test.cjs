/** CPU worker_threads/structured-clone evidence, not browser/GPU/mobile frame-time validation. */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { Worker } = require('node:worker_threads');
const {
  V6TerrainBuilder,
  isPreparedV6World,
} = require('../.domain-build/domain/v6-terrain-builder');
const { v6TransferBuffers } = require('../.domain-build/domain/v6-terrain-data');
const {
  V6WorkerPreparation,
  configureV6WorkerFactory,
} = require('../.domain-build/application/V6WorkerPreparation');
const { v6WorkerEnvelope } = require('../.domain-build/application/V6WorkerProtocol');
const { V6PreparationFlow } = require('../.domain-build/application/V6PreparationFlow');
const { V6WorkerRuntime } = require('../.domain-build/application/V6WorkerRuntime');
const worlds = require('../.domain-build/domain/v6-world');
const game = require('../.domain-build/domain/game');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
const expected = require('./fixtures/terrain6-worker-baseline.json');
const seed = expected.seed;
let dto,
  detached,
  realClient,
  heartbeats = 0;
const hash = (value) =>
  crypto
    .createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex');
function drain(job) {
  let p;
  do {
    p = job.step(256);
  } while (p.status === 'building');
  assert.equal(p.status, 'ready');
  return job.takeResult();
}
function fakePort() {
  return {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    sent: [],
    stopped: 0,
    postMessage(value) {
      this.sent.push(value);
    },
    terminate() {
      this.stopped++;
    },
  };
}
function reply(port, kind, data) {
  port.onmessage?.({ data: { ...port.sent[0], kind, ...(kind === 'complete' ? { data } : {}) } });
}
function invalid(data) {
  const job = V6TerrainBuilder.fromTransfer(seed, data);
  assert.throws(() => drain(job), /Invalid/);
  assert.equal(job.progress.status, 'failed');
}
before(async () => {
  const worker = new Worker(path.join(__dirname, 'helpers/v6-worker-thread.cjs'));
  const port = fakePort();
  port.postMessage = (value) => worker.postMessage(value);
  // Keep the worker alive just long enough to observe detached sender buffers.
  port.terminate = () => {};
  const timer = setInterval(() => heartbeats++, 5);
  let timeout;
  try {
    await new Promise((resolve, reject) => {
      timeout = setTimeout(
        () => reject(Error('Worker did not complete within 120 seconds')),
        120000,
      );
      worker.on('error', reject);
      worker.on('message', (message) => {
        if (message.kind === 'complete') dto = message.data;
        if (message.kind === 'transfer-observation') {
          detached = message.bytes;
          resolve();
        } else port.onmessage?.({ data: message });
      });
      realClient = new V6WorkerPreparation(seed, () => port);
    });
  } finally {
    clearInterval(timer);
    clearTimeout(timeout);
    await worker.terminate();
  }
});
test('real worker transfers exact pre-change Float32 bytes without blocking parent scheduling', () => {
  assert.ok(heartbeats > 2);
  assert.deepEqual(detached, [0, 0, 0]);
  assert.deepEqual(
    v6TransferBuffers(dto).map((b) => hash(Buffer.from(b))),
    expected.gridHashes,
  );
  assert.equal(hash(dto.complete.cells), expected.cellsHash);
  assert.equal(
    hash([...dto.complete.deposits.values()].map((d) => d.resource)),
    expected.resourcesHash,
  );
  assert.equal(hash([...dto.complete.deposits.values()].map((d) => d.levels)), expected.levelsHash);
  assert.equal(hash(dto.complete.trees), expected.treesHash);
  assert.equal(isPreparedV6World(dto), false);
  assert.throws(() => worlds.publishPreparedV6World(dto));
});
test('real client hydrates local methods and saves exactly once without leaking DTO ownership', () => {
  assert.equal(worlds.hasPreparedV6World(seed), false);
  assert.equal(realClient.mode, 'worker');
  const result = drain(realClient);
  assert.equal(realClient.mode, 'hydrate');
  assert.equal(isPreparedV6World(result), true);
  assert.equal(worlds.getV6World(seed), result.terrain);
  assert.equal(hash(game.exportSave(game.createGame(60000, seed, 6))), expected.saveHash);
  assert.throws(() => realClient.takeResult());
  assert.equal(realClient.cancel(), false);
  const w = result.terrain;
  for (let z = 0; z < 192; z++)
    for (let x = 0; x < 192; x++) assert.deepEqual(w.at(x, z), dto.complete.cells[z * 192 + x]);
  const groundBits = new Uint32Array(dto.lattice.grounds.buffer),
    before = groundBits[0];
  const old = w.vertex(0, 0);
  groundBits[0] = 0;
  assert.deepEqual(w.vertex(0, 0), old);
  groundBits[0] = before;
  // Unvisited water/border vertices use recreated starter/landform closures, not cloned methods.
  const clone = drain(V6TerrainBuilder.fromTransfer(seed, structuredClone(dto))).terrain;
  for (const [x, z] of [
    [0, 0],
    [768, 768],
    [401, 12],
    [40, 700],
    [100, 100],
  ])
    assert.deepEqual(w.vertex(x, z), clone.vertex(x, z));
  for (const [x, z] of [
    [-2, 5],
    [191.99, 100.5],
    [12.25, 12.5],
    [90.25, 80.75],
  ]) {
    assert.equal(w.groundHeight(x, z), clone.groundHeight(x, z));
    assert.equal(w.naturalHeight(x, z), clone.naturalHeight(x, z));
    assert.deepEqual(w.normal(x, z), clone.normal(x, z));
  }
});
test('schema validation rejects mismatched revisions, buffers, numbers, resources and trees', () => {
  for (const alter of [
    (d) => {
      d.format = 2;
    },
    (d) => {
      d.seed++;
    },
    (d) => {
      d.revision = 'future';
    },
    (d) => {
      d.feature.seed++;
    },
    (d) => {
      d.starter.pockets[0].rx = 0;
    },
    (d) => {
      d.lattice.grounds = new Float32Array(2);
    },
    (d) => {
      d.lattice.stones = d.lattice.soils;
    },
    (d) => {
      d.lattice.grounds[0] = Infinity;
    },
    (d) => {
      d.lattice.grounds[0] = NaN;
      d.lattice.stones[0] = 1;
    },
    (d) => {
      d.complete.cells.pop();
    },
    (d) => {
      const c = d.complete.cells.find((c) => c);
      c.x++;
    },
    (d) => {
      d.complete.deposits.values().next().value.resource.id = 'forged';
    },
    (d) => {
      d.complete.deposits.values().next().value.levels = [1, 1];
    },
    (d) => {
      d.complete.trees[0].baseElevation = Infinity;
    },
    (d) => {
      d.complete.trees.push(d.complete.trees[0]);
    },
  ]) {
    const copy = structuredClone(dto);
    alter(copy);
    invalid(copy);
  }
  const copy = structuredClone(dto);
  structuredClone(copy, { transfer: v6TransferBuffers(copy) });
  invalid(copy);
  if (typeof SharedArrayBuffer === 'function') {
    const shared = structuredClone(dto);
    shared.lattice.grounds = new Float32Array(
      new SharedArrayBuffer(dto.lattice.grounds.byteLength),
    );
    invalid(shared);
  }
});
test('completed DTO remains usable after a long page pause; unrelated stale jobs are ignored', () => {
  const port = fakePort();
  let now = 0;
  const job = new V6WorkerPreparation(
    seed,
    () => port,
    () => now,
  );
  port.onmessage({ data: { ...v6WorkerEnvelope(9999999, seed), kind: 'failed' } });
  assert.equal(job.waiting, true);
  const staleError = port.onerror;
  reply(port, 'complete', dto);
  staleError();
  now = 90000;
  job.step(1);
  assert.equal(job.mode, 'hydrate');
  assert.equal(job.cancel(), true);
  assert.equal(job.step(1).status, 'cancelled');
  assert.throws(() => job.takeResult());
});
test('worker creation, transport, wrong-version, payload and idle failures use cooperative fallback', () => {
  const failures = [
    (port) => {
      port.onerror();
    },
    (port) => {
      port.onmessageerror();
    },
    (port) => {
      port.onmessage({
        data: { ...port.sent[0], revision: 'future', kind: 'complete', data: dto },
      });
    },
    (port) => {
      port.onmessage({ data: { ...port.sent[0], seed: seed + 1, kind: 'complete', data: dto } });
    },
    (port) => {
      reply(port, 'failed');
    },
    (port) => {
      reply(port, 'complete', { invalid: true });
    },
  ];
  for (const failure of failures) {
    const port = fakePort(),
      job = new V6WorkerPreparation(seed, () => port);
    failure(port);
    job.step(1);
    assert.equal(job.mode, 'fallback');
    assert.equal(port.stopped, 1);
    assert.equal(drain(job).terrain.seed, seed);
  }
  for (const create of [
    () => {
      throw Error('CSP / unavailable');
    },
    () => ({
      ...fakePort(),
      postMessage() {
        throw Error('clone failed');
      },
    }),
  ]) {
    const job = new V6WorkerPreparation(seed, create);
    job.step(1);
    assert.equal(job.mode, 'fallback');
    job.cancel();
  }
  let now = 0;
  const port = fakePort(),
    job = new V6WorkerPreparation(
      seed,
      () => port,
      () => now,
    );
  now = 30001;
  job.step(1);
  assert.equal(job.mode, 'fallback');
  job.cancel();
});
test('cancel/restart and storage mutation cannot publish or invoke callbacks from late completions', () => {
  let port;
  configureV6WorkerFactory(() => (port = fakePort()));
  // A distinct unprepared seed exercises the worker route without another full generation.
  const other = 74129,
    bytes = new Map([
      [
        SAVE_KEY,
        JSON.stringify({
          schemaVersion: 10,
          terrainVersion: 6,
          terrainRevision: dto.revision,
          mapSeed: other,
        }),
      ],
    ]);
  let done = 0,
    failures = 0;
  const storage = {
    getItem: (key) => bytes.get(key) ?? null,
    setItem: () => assert.fail('must not write'),
    removeItem: () => assert.fail('must not delete'),
  };
  const flow = new V6PreparationFlow();
  try {
    flow.start(
      storage,
      () => done++,
      () => failures++,
    );
    for (let i = 0; i < 3; i++) flow.tick();
    assert.ok(port);
    const late = port.onmessage,
      sent = port.sent[0];
    flow.cancel();
    late({ data: { ...sent, kind: 'complete', data: dto } });
    assert.equal(flow.active, false);
    assert.equal(done, 0);
    assert.equal(worlds.hasPreparedV6World(other), false);
    flow.start(
      storage,
      () => done++,
      () => failures++,
    );
    for (let i = 0; i < 3; i++) flow.tick();
    bytes.set(SAVE_KEY, 'changed raw save');
    flow.tick();
    assert.equal(flow.active, false);
    assert.equal(failures, 1);
    assert.equal(done, 0);
    assert.equal(bytes.get(SAVE_KEY), 'changed raw save');
  } finally {
    flow.cancel();
    configureV6WorkerFactory(null);
  }
});
test('worker runtime cancellation and supersession discard scheduled old work', () => {
  const queue = [],
    messages = [],
    runtime = new V6WorkerRuntime(
      (m) => messages.push(m),
      (f) => queue.push(f),
    );
  const a = { ...v6WorkerEnvelope(101, seed), kind: 'prepare' };
  runtime.receive(a);
  runtime.receive({ ...a, kind: 'cancel' });
  queue.shift()();
  assert.equal(messages.length, 0);
  runtime.receive(a);
  runtime.receive({ ...a, requestId: 102 });
  queue.shift()();
  assert.equal(messages.length, 0);
  queue.shift()();
  assert.equal(messages[0].requestId, 102);
  runtime.receive({ ...a, requestId: 102, kind: 'cancel' });
  queue.shift()();
  assert.equal(messages.length, 1);
});
test('preview explicitly emits the worker asset and keeps engine dependencies outside it', () => {
  const build = fs.readFileSync(path.join(__dirname, '../scripts/preview/build.cjs'), 'utf8');
  assert.match(build, /terrain6-worker\.ts/);
  assert.match(build, /terrain6-worker\.js/);
  assert.match(
    fs.readFileSync(path.join(__dirname, '../scripts/preview/terrain6-worker.ts'), 'utf8'),
    /MessageChannel/,
  );
  assert.match(
    fs.readFileSync(path.join(__dirname, '../scripts/preview/bootstrap.ts'), 'utf8'),
    /configureV6WorkerFactory/,
  );
});
