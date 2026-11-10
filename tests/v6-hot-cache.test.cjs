const test = require('node:test');
const assert = require('node:assert/strict');
const { V6SurfaceChunks } = require('../.domain-build/art/V6SurfaceChunks');
const { V6SurfaceCache } = require('../.domain-build/art/V6SurfaceCache');
const {
  V6SurfaceBudget,
  V6SurfaceBudgetError,
  v6SurfaceCost,
} = require('../.domain-build/art/V6SurfaceBudget');
const { V6TerrainPicking } = require('../.domain-build/application/V6TerrainPicking');
const uploader = require('./helpers/v6-upload-fixture.cjs');
function source(edits = new Map()) {
  const resource = (x, z) => ({ id: `n${x}_${z}`, x, z, kind: 'stone', amount: 3 });
  const world = {
    seed: 1,
    size: 192,
    at: (x, z) => (x >= 0 && z >= 0 && x < 192 && z < 192 ? { reserved: false } : null),
    groundHeight: () => 2,
    naturalHeight: () => 5,
    normal: () => [0, 1, 0],
    resourceAt: resource,
  };
  return {
    world,
    revision: 'same-token',
    capAt: () => Infinity,
    resourceAt: resource,
    editAt: (x, z) => edits.get(`${x},${z}`) ?? null,
    retainedHeightInCell: () => 5,
    heightInCell: (_x, _z, x, z) =>
      edits.has(`${x},${z}`) ? Math.fround(0.015 + edits.get(`${x},${z}`).level) : 5,
  };
}
const empty = () => ({
  positions: [],
  normals: [],
  colors: [],
  indices: [],
  triangles: [],
  min: [0, 0, 0],
  max: [0, 0, 0],
});
const coast = { keys: ['0,0', '1,0'], begin: () => ({ advance: () => true, result: empty }) };
function fixture() {
  const chunks = new V6SurfaceChunks(source(), coast),
    f = uploader();
  const tx = () => {
    for (let i = 0; i < 100; i++) {
      const result = chunks.advance(100000, Infinity);
      f.uploads.retain(chunks.cachedMeshes());
      if (result) return result;
    }
    throw Error('never ready');
  };
  const settle = (keys, detail = keys, error = 0.25) => {
    chunks.request(keys, detail, error);
    let rebuilt = 0,
      bytes = 0,
      groups = 0;
    while (!chunks.isSettled()) {
      assert.ok(++groups < 100);
      const t = tx();
      f.uploads.stage(t.chunks);
      while (!f.uploads.advance(262144, Infinity)) bytes += f.uploads.lastAdvanceBytes;
      bytes += f.uploads.lastAdvanceBytes;
      rebuilt += t.rebuiltCells;
      t.commit();
      f.uploads.retain(chunks.cachedMeshes());
      f.uploads.publish();
      const usage = chunks.memoryUsage();
      assert.ok(usage.resident + usage.staging <= usage.limit);
      const cache = chunks.cacheUsage();
      assert.ok(cache.bytes <= cache.limit && cache.entries <= cache.maxEntries);
    }
    return { rebuilt, bytes, groups };
  };
  return { chunks, f, tx, settle };
}
test('warm near-away-return switches the same CPU, picker and GPU snapshots with zero rebuild/upload', () => {
  const { chunks, f, settle } = fixture(),
    keys = coast.keys;
  settle(keys, []);
  const cold = settle(keys, ['0,0']);
  assert.ok(cold.rebuilt > 0 && cold.bytes > 0);
  const snapshot = new Map(chunks.resident()),
    meshes = f.meshes.slice();
  settle(keys, []);
  const warm = settle(keys, ['0,0']);
  assert.equal(warm.rebuilt, 0);
  assert.equal(warm.bytes, 0);
  for (const [key, original] of snapshot) assert.strictEqual(chunks.resident().get(key), original);
  assert.ok(meshes.every((m) => !m.destroyed));
  const picker = new V6TerrainPicking();
  picker.sync(chunks.resident().values());
  assert.equal(
    picker.pick({ o: { x: 8.5, y: 10, z: 8.5 }, d: { x: 0, y: -1, z: 0 } }).resourceId,
    'n8_8',
  );
  assert.strictEqual(chunks.resident().get('0,0').support, snapshot.get('0,0').support);
  settle([], []);
  assert.equal(chunks.ready(8, 8), false);
  assert.equal(chunks.resident().size, 0);
  assert.equal(f.uploads.keys().length, 0);
  assert.ok(f.parent.children.every((n) => !n.active));
  assert.equal(settle(keys, ['0,0']).bytes, 0);
  chunks.dispose();
  f.uploads.dispose();
  assert.equal(chunks.cacheUsage().bytes, 0);
  assert.equal(chunks.memoryUsage().resident, 0);
  assert.equal(f.parent.children.length, 0);
  assert.ok(f.meshes.every((m) => m.destroyed === 1));
});
test('far cache includes neighbor detail and error; a visual anchor invalidates hidden variants', () => {
  const { chunks, settle } = fixture(),
    keys = coast.keys;
  settle(keys, []);
  const coarse = chunks.resident().get('0,0');
  settle(keys, ['1,0']);
  const seam = chunks.resident().get('0,0');
  assert.notStrictEqual(seam, coarse);
  settle(keys, []);
  assert.strictEqual(chunks.resident().get('0,0'), coarse);
  settle(keys, ['1,0']);
  assert.strictEqual(chunks.resident().get('0,0'), seam);
  settle(keys, [], 0);
  assert.notStrictEqual(chunks.resident().get('0,0'), coarse);
  assert.equal(chunks.resident().get('0,0').mesh.triangles.length, 256 * 32);
  settle(keys, [], 0.25);
  assert.strictEqual(chunks.resident().get('0,0'), coarse);
  chunks.setVisualCells(new Set(['15,8']));
  settle(keys, []);
  assert.notStrictEqual(chunks.resident().get('0,0'), coarse);
  const owner = chunks
    .resident()
    .get('0,0')
    .mesh.triangles.filter((t) => t.x === 15 && t.z === 8);
  assert.equal(owner.length, 32);
  assert.ok(owner.every((t) => t.resourceId === null));
});
test('offscreen boundary edits and equal revision tokens cannot resurrect prior geometry', () => {
  const { chunks, settle } = fixture(),
    keys = coast.keys;
  settle(keys, []);
  settle(keys);
  settle([], []);
  chunks.update(source(new Map([['15,8', { cut: 2.015, level: 2, fills: [] }]])), [
    { x: 15, z: 8 },
  ]);
  const result = settle(keys);
  assert.equal(result.rebuilt, 512);
  const picker = new V6TerrainPicking();
  picker.sync(chunks.resident().values());
  const hit = picker.pick({ o: { x: 15.5, y: 10, z: 8.5 }, d: { x: 0, y: -1, z: 0 } });
  assert.equal(hit.point.y, Math.fround(2.015));
  assert.equal(hit.resourceId, null);
  settle(keys, []);
  settle(keys);
  picker.sync(chunks.resident().values());
  assert.equal(
    picker.pick({ o: { x: 15.5, y: 10, z: 8.5 }, d: { x: 0, y: -1, z: 0 } }).point.y,
    Math.fround(2.015),
  );
});
test('cancelled cached transactions remain hidden, cannot commit, and survive a later valid request', () => {
  const { chunks, f, tx, settle } = fixture(),
    keys = coast.keys;
  settle(keys, []);
  settle(keys, ['0,0']);
  settle(keys, []);
  const coarse = chunks.resident().get('0,0');
  chunks.request(keys, ['0,0']);
  const pending = tx();
  assert.equal(pending.rebuiltCells, 0);
  f.uploads.stage(pending.chunks);
  assert.equal(f.uploads.advance(0, 0), true);
  assert.strictEqual(chunks.resident().get('0,0'), coarse);
  chunks.request(keys, []);
  f.uploads.cancel();
  assert.throws(() => pending.commit(), /Stale/);
  settle(keys, []);
  assert.equal(settle(keys, ['0,0']).bytes, 0);
});
function smallMesh() {
  return {
    positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
    colors: Array(12).fill(1),
    indices: [0, 1, 2],
    triangles: [{}],
    min: [0, 0, 0],
    max: [1, 0, 1],
  };
}
test('hot LRU respects bytes/count, pins pending borrows, and yields memory before rejecting staging', () => {
  const cost = v6SurfaceCost(smallMesh()),
    budget = new V6SurfaceBudget(cost * 10),
    cache = new V6SurfaceCache(budget, cost * 2, 2);
  function store(key) {
    const signature = cache.signature(key, new Set([key]), 0.25),
      mesh = smallMesh();
    cache.activate(key, cache.snapshot(signature, { key, mesh, surface: {} }, new Map(), null));
    cache.activate(key, null);
    cache.finish();
    return signature;
  }
  const a = store('0,0'),
    b = store('1,0');
  assert.equal(cache.usage().bytes, cost * 2);
  assert.ok(cache.find(a));
  cache.finish();
  const c = store('2,0');
  assert.equal(cache.find(b), undefined, 'least recently used is evicted');
  assert.ok(cache.find(a));
  budget.reserve(cost * 9);
  assert.equal(cache.find(c), undefined, 'unpinned cache is reclaimed before failure');
  assert.equal(cache.usage().bytes, cost);
  assert.throws(() => budget.reserve(1), V6SurfaceBudgetError);
  budget.cancel();
  cache.finish();
  cache.clear();
  assert.equal(budget.usage().resident, 0);
  const emptyCache = new V6SurfaceCache(budget, cost * 10, 2);
  for (let i = 0; i < 8; i++) {
    const key = `${i},0`,
      signature = emptyCache.signature(key, new Set(), 0.25);
    emptyCache.activate(
      key,
      emptyCache.snapshot(signature, { key, mesh: empty(), surface: {} }, new Map(), null),
    );
    emptyCache.activate(key, null);
    emptyCache.finish();
  }
  assert.equal(emptyCache.usage().entries, 2, 'empty chunks also obey entry cap');
});
test('GPU cache eviction, borrowed cancellation and upload failure release every resource exactly once', () => {
  const f = uploader(),
    a = smallMesh(),
    b = smallMesh(),
    c = smallMesh();
  f.uploads.stage([{ key: 'a', mesh: a }]);
  f.uploads.advance(65536, Infinity);
  f.uploads.publish();
  const node = f.parent.children[0],
    old = f.meshes[0];
  f.uploads.retain(new Set([a]));
  f.uploads.stage([{ key: 'a', mesh: b }]);
  f.uploads.advance(65536, Infinity);
  f.uploads.publish();
  assert.equal(node.active, false);
  assert.equal(old.destroyed, undefined);
  f.uploads.stage([
    { key: 'a', mesh: a },
    { key: 'c', mesh: c },
  ]);
  f.failOn(f.calls.length);
  assert.throws(() => f.uploads.advance(65536, Infinity), /simulated/);
  assert.equal(old.destroyed, undefined);
  assert.equal(node.active, false);
  f.uploads.stage([{ key: 'a', mesh: a }]);
  f.uploads.retain(new Set());
  assert.equal(old.destroyed, undefined, 'borrow is pinned until cancelled or published');
  f.uploads.cancel();
  assert.equal(old.destroyed, 1);
  f.uploads.dispose();
  assert.ok(f.meshes.every((m) => m.destroyed === 1));
  assert.equal(f.parent.children.length, 0);
});

test('moving away and back before a transaction finishes reuses the still-active complete snapshot', () => {
  const { chunks, f, tx, settle } = fixture(),
    keys = coast.keys;
  settle(keys, []);
  settle(keys, ['0,0']);
  const original = new Map(chunks.resident());
  chunks.request(keys, ['1,0']);
  chunks.advance(2, Infinity);
  assert.equal(chunks.isSettled(), false);
  const calls = f.calls.length;
  const result = settle(keys, ['0,0']);
  assert.equal(result.rebuilt, 0);
  assert.equal(result.bytes, 0);
  assert.equal(f.calls.length, calls);
  for (const [key, snapshot] of original) assert.strictEqual(chunks.resident().get(key), snapshot);
  assert.ok(f.parent.children.filter((n) => n.active).every((n) => !n.destroyed));
  chunks.request(keys, []);
  const pending = tx();
  f.uploads.stage(pending.chunks);
  f.uploads.cancel();
  chunks.abort();
  assert.ok(f.parent.children.filter((n) => n.active).every((n) => !n.destroyed));
});

test('same-seed loaded state invalidates cached edits through the real view sync; new seed disposes all old meshes', () => {
  const fs = require('node:fs'),
    ts = require('typescript');
  const f = uploader(),
    module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/V6IslandView.ts', 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    },
  ).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === '../domain/v6-edit-surface')
        return {
          getV6EditSurface(state) {
            return source(new Map(state.terrain6.cells.map((c) => [`${c.x},${c.z}`, c])));
          },
        };
      if (id === '../art/V6Coast')
        return { ...require('../.domain-build/art/V6Coast'), createV6CoastSource: () => coast };
      if (id === './V6ChunkMeshes') return { V6ChunkMeshes: f.uploads.constructor };
      if (id.startsWith('../')) return require('../.domain-build/' + id.slice(3));
      throw Error(id);
    },
    module,
    module.exports,
  );
  const view = new module.exports.V6IslandView(
    { node: f.parent },
    {},
    {},
    { configure() {} },
    {
      setFarms() {},
      setNaturalChunks() {},
      clearNaturalChunks() {},
      clearCoastChunks() {},
    },
  );
  const initial = {
    mapSeed: 1,
    buildings: [],
    trees: [],
    naturalResources: [],
    landExtensions: [],
    terrain6: { cells: [] },
  };
  view.sync(initial);
  const A = { minX: 0, minZ: 0, maxX: 15, maxZ: 15 },
    away = { minX: 80, minZ: 80, maxX: 96, maxZ: 96 };
  const drive = (bounds) => {
    for (let i = 0; i < 20; i++) {
      view.frame(
        bounds,
        { maxPatchBuilds: 100000, maxMilliseconds: 100000, maxUploadBytes: 8388608 },
        undefined,
        undefined,
        0,
        0.25,
      );
      if (i > 0 && !view.isLoading()) return;
    }
    throw Error('view never settled');
  };
  drive(A);
  drive(away);
  assert.ok(view.chunks.cacheUsage().entries > 0);
  const loaded = {
    ...initial,
    terrain6: { cells: [{ x: 8, z: 8, cut: 2.015, level: 2, fills: [] }] },
  };
  const before = JSON.stringify(loaded);
  view.sync(loaded);
  assert.equal(view.isGroundReady(8, 8), false);
  drive(A);
  const hit = view.pickTerrain({ o: { x: 8.5, y: 10, z: 8.5 }, d: { x: 0, y: -1, z: 0 } });
  assert.equal(hit.point.y, Math.fround(2.015));
  assert.equal(JSON.stringify(loaded), before, 'cache does not write saved state');
  const oldMeshes = f.meshes.slice();
  view.sync({ ...initial, mapSeed: 2 });
  assert.ok(oldMeshes.every((m) => m.destroyed === 1));
  assert.equal(view.chunks.cacheUsage().entries, 0);
  assert.equal(view.chunks.resident().size, 0);
  view.dispose();
});
