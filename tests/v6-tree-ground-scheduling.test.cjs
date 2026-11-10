/** Real scheduler/view/uploader with Cocos call doubles; no GPU or screen claims. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, presentation } = require('./helpers/v6-tree-view-fixture.cjs');
const { v6TreeRoot } = require('../.domain-build/art/V6TreeGeometry');
// Actual identities and positions sampled from seed 42173, kept as a small regression fixture.
const blocked = { id: 't422', x: 114, z: 48 },
  ready = { id: 't992', x: 141, z: 120 };
const ids = (f) => [...f.view.stream.surfaces()].map(([id]) => id).sort();
test('constrained terrain excludes the two-cell tree fringe that used to occupy the only upload slot', () => {
  const { V6IslandView } = presentation('V6IslandView');
  const view = Object.create(V6IslandView.prototype),
    requests = [];
  Object.assign(view, {
    coast: { keys: ['7,3', '8,3', '8,7'] },
    constrained: true,
    failure: null,
    failureView: '',
    pending: null,
    requestedOverview: 3,
    requestedFine: new Set(),
    chunks: {
      resident: () => new Map([['8,7', { mesh: { indices: [0] }, detail: true }]]),
      isSettled: () => true,
      request: (keys, fine) => requests.push({ keys, fine }),
      advance: () => null,
      cachedMeshes: () => new Set(),
      isCurrent: () => true,
    },
    meshes: { retain() {} },
  });
  const f = fixture([blocked, ready]);
  view.frame(f.bounds, { maxMilliseconds: Infinity }, undefined, 30, 0, 0.25);
  assert.deepEqual(requests[0].keys, ['8,3', '8,7']);
  assert.equal(f.view.stream.chunks.has('7:3'), true);
  f.settle();
  assert.deepEqual(ids(f), ['t992']);
  assert.equal(f.view.stream.pending, null);
  assert.equal(f.view.loading, false, 'An unavailable margin cannot keep the tree spinner running');
  assert.equal(f.view.bounds('t422'), null);
  assert.ok(f.view.bounds('t992'));
  assert.equal(f.view.stream.cacheUsage().entries, 0);
  f.view.dispose();
});
test('previously blocked trees resume when their ground publishes without changing saved trees or resyncing', () => {
  const f = fixture([blocked, ready]),
    saved = JSON.stringify(f.state);
  f.settle();
  const previous = f.view.bounds('t992');
  f.ground.live.set('7,3', { detail: true });
  f.settle();
  assert.deepEqual(ids(f), ['t422', 't992']);
  assert.deepEqual(f.view.bounds('t992'), previous);
  assert.equal(JSON.stringify(f.state), saved);
  f.view.dispose();
  assert.ok(f.pools.every((p) => p.meshes.every((m) => m.destroyed === 1)));
});
test('absent ground creates no CPU batch or GPU objects while overall terrain loading is still represented', () => {
  const f = fixture([blocked, ready], []);
  f.frame();
  assert.equal(f.view.stream.pending, null);
  assert.equal(f.pools.length, 0);
  assert.equal(f.view.loading, false);
  const { TownView } = presentation('TownView'),
    town = Object.create(TownView.prototype);
  Object.assign(town, { island: { isLoading: () => true }, resources: f.view });
  assert.equal(town.loading, true);
  town.island.isLoading = () => false;
  assert.equal(town.loading, false);
  f.ground.live.set('8,7', { detail: true });
  f.settle();
  assert.deepEqual(ids(f), ['t992']);
  f.view.dispose();
});
test('ground invalidation cancels a partially built nearest batch then services a ready farther batch', () => {
  const f = fixture([blocked, { id: 'neighbor', x: 115, z: 48 }, ready], ['7,3', '8,7']);
  f.frame({ maxTrees: 1 });
  assert.equal(f.view.stream.pending.chunk.key, '7:3');
  assert.deepEqual(ids(f), []);
  f.ground.dirty.add('114,48');
  f.frame({ maxTrees: 1 });
  assert.deepEqual(ids(f), ['t992']);
  assert.equal(f.view.stream.pending, null);
  f.ground.dirty.clear();
  f.settle();
  assert.deepEqual(ids(f), ['neighbor', 't422', 't992']);
  f.view.dispose();
});
test('ground loss during a hidden upload destroys staged meshes once and does not starve ready trees', () => {
  const dense = Array.from({ length: 8 }, (_, i) => ({ id: `near-${i}`, x: 114 + i, z: 48 }));
  const f = fixture([...dense, ready], ['7,3', '8,7']);
  f.controls.maxUploadBytes = 65536;
  for (let i = 0; i < 100; i++) {
    f.frame();
    if (f.pools[0]?.meshes.length && !f.pools[0].uploads.keys().length) break;
  }
  const staged = f.pools[0];
  assert.ok(staged.meshes.length > 0);
  assert.equal(staged.uploads.keys().length, 0);
  assert.deepEqual(ids(f), []);
  f.ground.coastDirty.add('7,3');
  f.settle();
  assert.ok(staged.meshes.every((m) => m.destroyed === 1));
  assert.deepEqual(ids(f), ['t992']);
  f.ground.coastDirty.clear();
  f.settle();
  assert.deepEqual(ids(f), [...dense.map((t) => t.id), 't992'].sort());
  f.view.dispose();
  assert.ok(f.pools.every((p) => p.meshes.every((m) => m.destroyed === 1)));
});
test('chunk availability does not bypass exact anchor validation or the fine-ground picking gate', () => {
  const f = fixture([ready]);
  f.controls.anchorsAllowed = false;
  f.frame();
  assert.deepEqual(ids(f), []);
  assert.equal(f.pools.length, 0, 'All actual anchors are still checked before upload');
  f.controls.anchorsAllowed = true;
  f.ground.live.get('8,7').detail = false;
  f.settle();
  assert.ok(f.view.bounds('t992'));
  const root = v6TreeRoot(42173, ready.x, ready.z, () => 7.015),
    ray = { o: { x: root.x, y: 30, z: root.z }, d: { x: 0, y: -1, z: 0 } };
  assert.equal(f.view.pick(ray), null, 'Overview cannot become harvestable');
  assert.equal(f.view.pick(ray, true)?.id, 't992');
  f.ground.live.get('8,7').detail = true;
  assert.equal(f.view.pick(ray)?.id, 't992');
  f.view.dispose();
});
test('near/far changes, camera departure and disposal still cancel or release unavailable work', () => {
  const f = fixture([blocked, ready], ['7,3', '8,7']);
  f.settle();
  const near = f.view.bounds('t422');
  f.ground.dirty.add('114,48');
  f.frame({ lodSpan: 90 });
  assert.deepEqual(
    f.view.bounds('t422'),
    near,
    'Keep the old complete snapshot during unavailable LOD transition',
  );
  f.ground.dirty.clear();
  for (let i = 0; i < 20; i++) {
    f.frame({ lodSpan: 90 });
    if (!f.view.loading) break;
  }
  assert.equal(f.view.loading, false);
  assert.ok([...f.view.stream.live.values()].every((e) => e.far));
  f.view.stream.frame(
    { minX: -100, minZ: -100, maxX: -90, maxZ: -90 },
    { maxMilliseconds: Infinity },
    () => 0,
  );
  assert.deepEqual(ids(f), []);
  assert.ok(f.view.stream.cacheUsage().entries > 0);
  f.view.dispose();
  assert.equal(f.view.stream.cacheUsage().bytes, 0);
  assert.ok(f.pools.every((p) => p.meshes.every((m) => m.destroyed === 1)));
});
test('tree batch centers and actual offset anchors always query the same production terrain chunk', () => {
  const f = fixture([]);
  for (const seed of [1, 1937, 42173, 2147483647])
    for (const x of [0, 15, 16, 31, 114, 127, 128, 191])
      for (const z of [0, 15, 16, 48, 120, 191]) {
        const root = v6TreeRoot(seed, x, z, () => 7.015),
          cx = Math.floor(x / 16) * 16 + 8,
          cz = Math.floor(z / 16) * 16 + 8;
        assert.equal(f.v6ChunkKey(root.x, root.z), f.v6ChunkKey(cx, cz));
        assert.equal(f.ground.visible(root.x, root.z), f.ground.visible(cx, cz));
      }
  f.view.dispose();
});
