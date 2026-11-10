/** Production CPU stream/cache and staged Cocos calls, not browser/GPU/device evidence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { V6TreeStreaming } = require('../.domain-build/application/V6TreeStreaming');
const { V6TreeCache, v6TreeCacheCost } = require('../.domain-build/application/V6TreeCache');
const { V6TreeBatchBuilder } = require('../.domain-build/art/V6TreeGeometry');
const uploader = require('./helpers/v6-upload-fixture.cjs');
const bounds = { minX: 4, minZ: 4, maxX: 12, maxZ: 12 };
const away = { minX: 100, minZ: 100, maxX: 110, maxZ: 110 };
const budget = { maxTrees: 24, maxMilliseconds: Infinity, maxUploadBytes: 8 * 1024 * 1024 };
const saved = () => ({ mapSeed: 42173, lastSeenAt: 100, trees: [{ id: 'a', x: 8, z: 8 }] });
const ids = (stream) => [...stream.surfaces()].map(([id]) => id);
function fixture(state = saved(), cache) {
  const published = new Map(),
    removed = [],
    cancelled = [];
  const controls = { ready: true, height: 7.015 };
  const stream = new V6TreeStreaming(
    (key, batch) => {
      if (!controls.ready) return false;
      published.set(key, batch);
      return true;
    },
    (key) => {
      removed.push(key);
      published.delete(key);
    },
    (key) => cancelled.push(key),
    () => controls.height,
    cache,
  );
  stream.sync(state, state.lastSeenAt);
  const frame = (view = bounds, limits = {}) =>
    stream.frame(view, { ...budget, ...limits }, () => 0);
  return { stream, state, published, removed, cancelled, controls, frame };
}
function entry(far = false) {
  const builder = new V6TreeBatchBuilder(
    42173,
    [{ id: 'a', x: 8, z: 8, stage: 3 }],
    far,
    () => 7.015,
  );
  builder.append();
  return { signature: 'same', far, batch: builder.finish() };
}
test('A away A reuses exact CPU batch but remains absent from rendering and exact-ID picking offscreen', () => {
  const f = fixture();
  f.frame();
  const original = f.published.get('0:0');
  assert.ok(original);
  f.frame(away);
  assert.equal(f.published.size, 0);
  assert.deepEqual(ids(f.stream), []);
  assert.equal(f.stream.cacheUsage().entries, 1);
  f.controls.ready = false;
  f.frame();
  assert.equal(f.stream.pending.batch, original);
  assert.equal(f.stream.cacheUsage().entries, 0, 'Pending ownership is not duplicated in cache');
  assert.deepEqual(ids(f.stream), []);
  assert.equal(f.stream.loading, true);
  f.controls.ready = true;
  f.frame();
  assert.equal(f.published.get('0:0'), original);
  assert.deepEqual(ids(f.stream), ['a']);
  assert.equal(f.stream.loading, false);
});
test('cache uses conservative byte and entry bounds with oldest-retired eviction; oversize is not retained', () => {
  const a = entry(),
    size = v6TreeCacheCost(a),
    cache = new V6TreeCache(size * 2);
  assert.ok(size > a.batch.bytes);
  cache.remember('a', a);
  cache.remember('b', a);
  cache.remember('c', a);
  assert.equal(cache.usage().bytes, size * 2);
  assert.equal(
    cache.take('a', 'same', false, () => 7.015),
    undefined,
  );
  assert.equal(
    cache.take('b', 'same', false, () => 7.015),
    a.batch,
  );
  assert.equal(cache.usage().bytes, size);
  cache.remember('c', a);
  assert.equal(cache.usage().bytes, size, 'Replacement is charged once');
  const small = new V6TreeCache(size - 1);
  small.remember('a', a);
  assert.equal(small.usage().entries, 0);
  const many = new V6TreeCache(size * 100);
  for (let i = 0; i < 40; i++) many.remember(String(i), a);
  assert.equal(many.usage().entries, 32);
  assert.equal(
    many.take('0', 'same', false, () => 7.015),
    undefined,
  );
  assert.equal(
    many.take('8', 'same', false, () => 7.015),
    a.batch,
  );
  many.clear();
  assert.equal(many.usage().bytes, 0);
  for (const invalid of [-1, NaN, Infinity, 0.5]) assert.throws(() => new V6TreeCache(invalid));
});
test('disabled or undersized cache safely rebuilds identical geometry without extra retention', () => {
  const f = fixture(saved(), new V6TreeCache(0));
  f.frame();
  const original = f.published.get('0:0');
  f.frame(away);
  assert.equal(f.stream.cacheUsage().bytes, 0);
  f.frame();
  assert.notEqual(f.published.get('0:0'), original);
  assert.deepEqual(f.published.get('0:0').mesh, original.mesh);
});
test('chopped IDs, displaced trees and growth stages invalidate all cached LODs', () => {
  for (const trees of [[], [{ id: 'a', x: 9, z: 8 }], [{ id: 'b', x: 8, z: 8 }]]) {
    const f = fixture();
    f.frame();
    f.frame(bounds, { lodSpan: 90 });
    f.frame(away);
    assert.equal(f.stream.cacheUsage().entries, 2);
    f.stream.sync({ ...f.state, trees }, 100);
    assert.equal(f.stream.cacheUsage().entries, 0);
    f.frame();
    assert.deepEqual(
      ids(f.stream),
      trees.map((t) => t.id),
    );
  }
  const f = fixture({ ...saved(), trees: [{ id: 'a', x: 8, z: 8, plantedAt: 100, readyAt: 400 }] });
  f.frame();
  f.frame(away);
  f.stream.sync(f.state, 199);
  assert.equal(f.stream.cacheUsage().entries, 1);
  f.stream.sync(f.state, 200);
  assert.equal(f.stream.cacheUsage().entries, 0);
});
test('ordinary immutable state cloning and quantity changes preserve valid cached geometry', () => {
  const f = fixture();
  f.frame();
  const original = f.published.get('0:0');
  f.frame(away);
  f.stream.sync({ ...f.state, trees: [{ ...f.state.trees[0], amount: 1 }] }, 101);
  f.frame();
  assert.equal(f.published.get('0:0'), original);
});
test('near far near reuse keeps old valid geometry until replacement upload completes', () => {
  const f = fixture();
  f.frame();
  const near = f.published.get('0:0');
  f.frame(bounds, { lodSpan: 90 });
  const far = f.published.get('0:0');
  assert.notEqual(far, near);
  f.controls.ready = false;
  f.frame();
  assert.equal(f.published.get('0:0'), far);
  assert.equal([...f.stream.surfaces()][0][1], far.surfaces.get('a'));
  f.controls.ready = true;
  f.frame();
  assert.equal(f.published.get('0:0'), near);
  f.frame(bounds, { lodSpan: 90 });
  assert.equal(f.published.get('0:0'), far);
});
test('changed actual trunk heights reject a cached snapshot even when seed and tree IDs match', () => {
  const f = fixture();
  f.frame();
  const original = f.published.get('0:0');
  f.frame(away);
  f.controls.height = 12.015;
  f.frame();
  const current = f.published.get('0:0');
  assert.notEqual(current, original);
  assert.equal(current.anchors[0].y, 12.015);
  assert.ok(current.mesh.min[1] > original.mesh.min[1] + 4.9);
});
test('cached hidden upload cancels if ground changes while waiting; never publishes old height', () => {
  const f = fixture();
  f.frame();
  f.frame(away);
  f.controls.ready = false;
  f.frame();
  f.controls.height = 15.015;
  f.controls.ready = true;
  f.frame();
  assert.equal(f.stream.pending, null);
  assert.deepEqual(f.cancelled, ['0:0']);
  assert.deepEqual(ids(f.stream), []);
  f.frame();
  assert.equal(f.published.get('0:0').anchors[0].y, 15.015);
});
test('cached pending work cancels on leave, LOD change, tree deletion, seed change and disposal', () => {
  for (const reason of ['leave', 'lod', 'delete', 'seed', 'dispose']) {
    const f = fixture();
    f.frame();
    f.frame(away);
    f.controls.ready = false;
    f.frame();
    assert.ok(f.stream.pending.batch);
    if (reason === 'leave') f.frame(away);
    if (reason === 'lod') f.frame(bounds, { lodSpan: 90, maxTrees: 0 });
    if (reason === 'delete') f.stream.sync({ ...f.state, trees: [] }, 100);
    if (reason === 'seed') f.stream.sync({ ...f.state, mapSeed: 42174 }, 100);
    if (reason === 'dispose') f.stream.dispose();
    assert.equal(f.stream.pending, null, reason);
    assert.deepEqual(f.cancelled, ['0:0'], reason);
    assert.deepEqual(ids(f.stream), [], reason);
    f.stream.dispose();
    assert.equal(f.stream.cacheUsage().bytes, 0);
    assert.equal(f.stream.cacheUsage().entries, 0);
  }
});
test('real V6TreeView keeps ground gate and reuploads retained CPU geometry with original uploader', () => {
  const fixtures = [],
    first = uploader();
  class Uploads {
    constructor() {
      const gpu = fixtures.length ? uploader() : first;
      fixtures.push(gpu);
      return gpu.uploads;
    }
  }
  let visible = true;
  const code = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/V6TreeView.ts', 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === 'cc') return { Node: first.parent.constructor };
      if (id === './V6ChunkMeshes') return { V6ChunkMeshes: Uploads };
      if (id === './WorldMaterial') return { worldMaterial: () => ({ destroy() {} }) };
      if (id === './TouchPicking') return { nearProjectedBounds: () => true };
      if (id.startsWith('../')) return require('../.domain-build/' + id.slice(3));
      throw Error(id);
    },
    module,
    module.exports,
  );
  const view = new module.exports.V6TreeView(
    first.parent,
    () => visible,
    () => 7.015,
  );
  view.sync(saved(), 100);
  function settle() {
    for (let i = 0; i < 1000; i++) {
      view.frame(bounds);
      if (!view.loading) return;
    }
    throw Error('Tree uploads did not converge');
  }
  settle();
  const initial = fixtures[0],
    originalCalls = initial.calls.length;
  assert.ok(originalCalls > 0);
  assert.ok(view.bounds('a'));
  view.frame(away);
  assert.equal(view.bounds('a'), null);
  assert.ok(
    initial.meshes.every((m) => m.destroyed === 1),
    'No additional GPU retention',
  );
  visible = false;
  view.frame(bounds);
  assert.equal(view.bounds('a'), null);
  assert.equal(fixtures.length, 1, 'Cache cannot bypass unpublished ground');
  visible = true;
  settle();
  assert.equal(fixtures.length, 2);
  assert.equal(fixtures[1].calls.length, originalCalls);
  assert.deepEqual(fixtures[1].calls, initial.calls, 'Same canonical upload data');
  assert.ok(view.bounds('a'));
  view.dispose();
  assert.ok(fixtures.every((f) => f.meshes.every((m) => m.destroyed === 1)));
});

test('leaving B cannot evict the already cached returning A under a one-chunk budget', () => {
  const state = { ...saved(), trees: [...saved().trees, { id: 'b', x: 104, z: 104 }] };
  const probe = fixture(state);
  probe.frame();
  const a = probe.published.get('0:0');
  probe.frame(away);
  const b = probe.published.get('6:6');
  const limit = Math.max(
    v6TreeCacheCost({
      signature: JSON.stringify([{ id: 'a', x: 8, z: 8, stage: 3 }]),
      far: false,
      batch: a,
    }),
    v6TreeCacheCost({
      signature: JSON.stringify([{ id: 'b', x: 104, z: 104, stage: 3 }]),
      far: false,
      batch: b,
    }),
  );
  probe.stream.dispose();
  const f = fixture(state, new V6TreeCache(limit));
  f.frame();
  const first = f.published.get('0:0');
  f.frame(away);
  assert.equal(f.stream.cacheUsage().entries, 1);
  f.frame();
  assert.equal(f.published.get('0:0'), first);
  assert.ok(f.stream.cacheUsage().bytes <= limit);
  f.stream.dispose();
});
