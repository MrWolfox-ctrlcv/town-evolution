const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { sampleCameras } = require('../scripts/diagnostics/cameras.cjs');
const { captureTrace } = require('../scripts/diagnostics/trace.cjs');

test('camera counters use command buffers, preserve unavailable samples and remove listeners', async () => {
  const events = new EventEmitter(),
    director = new EventEmitter();
  const cb = { numDrawCalls: 0, numTris: 0, numInstances: 0 };
  director.root = {
    pipelineEvent: events,
    pipeline: { commandBuffers: [cb] },
    device: { numDrawCalls: 999 },
  };
  const cc = { director, Director: { EVENT_AFTER_DRAW: 'after' } };
  const sample = vm.runInNewContext(`(${sampleCameras.toString()})`, {
    System: { import: async () => cc },
    performance,
    setTimeout,
    clearTimeout,
  });
  const pending = sample(1);
  await new Promise((r) => setImmediate(r));
  const bg = { name: 'BackgroundCamera', visibility: 0 };
  events.emit('render-camera-begin', bg);
  events.emit('render-camera-end', bg);
  const world = { name: 'WorldCamera', visibility: 1 };
  events.emit('render-camera-begin', world);
  cb.numDrawCalls = 7;
  cb.numTris = 100;
  cb.numInstances = 3;
  events.emit('render-camera-end', world);
  events.emit('render-camera-end', { name: 'Unmatched', visibility: 1 });
  director.emit('after');
  const result = await pending;
  assert.deepEqual(Array.from(result.samples[0].delta), [0, 0, 0]);
  assert.deepEqual(Array.from(result.samples[1].delta), [7, 100, 3]);
  assert.equal(result.samples[2].status, 'unavailable');
  assert.equal(result.status, 'partial');
  assert.equal(events.listenerCount('render-camera-begin'), 0);
  assert.equal(director.listenerCount('after'), 0);
});

test('browser trace filters supported categories and closes stream/session', async () => {
  const session = new EventEmitter(),
    calls = [];
  session.send = async (method, args) => {
    calls.push([method, args]);
    if (method === 'Tracing.getCategories') return { categories: ['gpu', 'cc', 'secret-category'] };
    if (method === 'Tracing.end') session.emit('Tracing.tracingComplete', { stream: 'stream' });
    if (method === 'IO.read') return { data: '{"traceEvents":[]}', eof: true };
    return {};
  };
  session.detach = async () => calls.push(['detach']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-trace-'));
  try {
    const file = path.join(dir, 'trace.json');
    const r = await captureTrace({ newBrowserCDPSession: async () => session }, file, async (ms) =>
      assert.equal(ms, 5000),
    );
    assert.equal(r.status, 'collected');
    assert.deepEqual(r.categories, ['cc', 'gpu']);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), { traceEvents: [] });
    assert.ok(calls.some(([m]) => m === 'IO.close'));
    assert.equal(calls.at(-1)[0], 'detach');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('unsupported trace reports failure rather than inventing GPU idle or zero work', async () => {
  const r = await captureTrace(
    {
      newBrowserCDPSession: async () => {
        throw Error('Unsupported');
      },
    },
    'unused',
  );
  assert.equal(r.status, 'unavailable');
  assert.match(r.reason, /Unsupported/);
});

test('diagnostic workflow is manual-only and old source remains separate from diagnostic scripts', () => {
  const workflow = fs.readFileSync('.github/workflows/render-diagnose.yml', 'utf8');
  const runner = fs.readFileSync('scripts/diagnostics/render-diagnose.cjs', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+push:|matrix:|capture\.cjs/m);
  assert.match(workflow, /42849656843/);
  assert.match(workflow, /dc88a433deba2a3c30d79b139e903f6a239f95dd/);
  assert.match(runner, /withDeadline\(main, 180000/);
  assert.match(runner, /verifyPackage\(root, out/);
  assert.match(runner, /sampleCameras, 30/);
});

test('frames without camera events are unavailable, never a successful zero-draw diagnosis', async () => {
  const events = new EventEmitter(),
    director = new EventEmitter();
  director.root = { pipelineEvent: events, pipeline: { commandBuffers: [] } };
  const cc = { director, Director: { EVENT_AFTER_DRAW: 'after' } };
  const sample = vm.runInNewContext(`(${sampleCameras.toString()})`, {
    System: { import: async () => cc },
    performance,
    setTimeout,
    clearTimeout,
  });
  const pending = sample(1);
  await new Promise((r) => setImmediate(r));
  director.emit('after');
  assert.equal((await pending).status, 'unavailable');
});
