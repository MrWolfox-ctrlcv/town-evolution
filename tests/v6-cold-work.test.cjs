const test = require('node:test');
const assert = require('node:assert/strict');
const { V6SurfaceChunks } = require('../.domain-build/art/V6SurfaceChunks');
const { V6SurfaceBudget, V6SurfaceBudgetError } = require('../.domain-build/art/V6SurfaceBudget');
const { V6TerrainPicking } = require('../.domain-build/application/V6TerrainPicking');
const uploader = require('./helpers/v6-upload-fixture.cjs');
const empty = () => ({
  positions: [],
  normals: [],
  colors: [],
  indices: [],
  triangles: [],
  min: [0, 0, 0],
  max: [0, 0, 0],
});
function source(edited = false) {
  const resource = (x, z) => ({ id: `n${x}_${z}`, x, z, kind: 'stone', amount: 3 });
  return {
    world: {
      seed: 1,
      size: 192,
      at: (x, z) => (x >= 0 && z >= 0 && x < 192 && z < 192 ? { reserved: false } : null),
      groundHeight: () => 2,
      naturalHeight: () => 5,
      normal: () => [0, 1, 0],
      resourceAt: resource,
    },
    revision: 'same-token',
    capAt: () => Infinity,
    resourceAt: resource,
    editAt: (x, z) => (edited && x === 15 && z === 8 ? { cut: 2.015, level: 2, fills: [] } : null),
    retainedHeightInCell: () => 5,
    heightInCell: (_x, _z, x, z) => (edited && x === 15 && z === 8 ? Math.fround(2.015) : 5),
  };
}
function fixture(budget) {
  let coastStarts = 0;
  const coast = {
    keys: ['0,0', '1,0', '5,5'],
    begin: () => {
      coastStarts++;
      let steps = 0;
      return { advance: () => ++steps >= 3, result: empty };
    },
  };
  const chunks = new V6SurfaceChunks(source(), coast, budget);
  const tx = () => {
    const t = chunks.advance(100000, Infinity);
    assert.ok(t);
    return t;
  };
  const settle = (keys, fine = keys) => {
    chunks.request(keys, fine);
    let count = 0;
    while (!chunks.isSettled()) {
      assert.ok(++count < 20);
      tx().commit();
    }
  };
  return { chunks, coast, tx, settle, coastStarts: () => coastStarts };
}
test('compatible requests retain cold coast, cell and merge continuations without early authority', () => {
  for (const phase of ['coast', 'cell', 'merge']) {
    const f = fixture(),
      c = f.chunks;
    c.request(['0,0']);
    c.advance(phase === 'coast' ? 1 : 24, Infinity);
    if (phase === 'merge') {
      let count = 0;
      while (!c.jobs[0].merge) {
        assert.ok(++count < 10000);
        assert.equal(c.advance(1, Infinity), null);
      }
    }
    const job = c.jobs[0],
      index = job.index,
      usage = c.memoryUsage(),
      built = c.rebuilt;
    assert.equal(c.ready(8, 8), false);
    for (let i = 0; i < 20; i++) c.request(['5,5', '0,0'], i % 2 ? ['0,0'] : ['0,0', '5,5']);
    c.request(['5,5', '0,0'], ['0,0'], 0.1);
    assert.strictEqual(c.jobs[0], job, 'fine work does not depend on far error');
    c.request(['5,5', '0,0'], ['0,0'], 0.25);
    assert.strictEqual(c.jobs[0], job, phase);
    assert.equal(job.index, index);
    assert.equal(c.rebuilt, built);
    assert.deepEqual(c.memoryUsage(), usage, 'retaining does not reserve or drop bytes');
    assert.equal(f.coastStarts(), 1);
    const t = f.tx();
    assert.equal(t.rebuiltCells, 256);
    assert.equal(c.resident().size, 0);
    t.commit();
    const picker = new V6TerrainPicking();
    picker.sync(c.resident().values());
    assert.equal(
      picker.pick({ o: { x: 8.5, y: 10, z: 8.5 }, d: { x: 0, y: -1, z: 0 } }).resourceId,
      'n8_8',
    );
    assert.equal(c.ready(8, 8), true);
    assert.equal(c.isSettled(), false, 'newly requested distant chunk still needs building');
    f.settle(['0,0', '5,5'], ['0,0']);
    const reference = fixture();
    reference.settle(['0,0', '5,5'], ['0,0']);
    for (const [key, chunk] of c.resident())
      assert.deepEqual(chunk.mesh, reference.chunks.resident().get(key).mesh);
    c.dispose();
    reference.chunks.dispose();
    assert.deepEqual(c.memoryUsage(), { resident: 0, staging: 0, limit: usage.limit });
  }
});
test('compatible change retains a partially completed atomic seam group and leaves new work dirty', () => {
  const f = fixture(),
    c = f.chunks,
    keys = f.coast.keys;
  f.settle(keys, []);
  c.request(keys, ['0,0']);
  let n = 0;
  while (!c.done.length) {
    assert.ok(++n < 10000);
    assert.equal(c.advance(1, Infinity), null);
  }
  assert.equal(c.jobs.length, 1);
  const done = c.done[0],
    job = c.jobs[0];
  c.request(keys, ['0,0', '5,5']);
  assert.strictEqual(c.done[0], done);
  assert.strictEqual(c.jobs[0], job);
  assert.equal(c.ready(8, 8), false);
  const t = f.tx();
  assert.deepEqual(
    t.chunks.map((x) => x.key),
    ['0,0', '1,0'],
  );
  t.commit();
  assert.equal(c.ready(8, 8), true);
  assert.equal(c.ready(88, 88), false);
  f.settle(keys, ['0,0', '5,5']);
  const reference = fixture();
  reference.settle(keys, ['0,0', '5,5']);
  for (const [key, chunk] of c.resident())
    assert.deepEqual(chunk.mesh, reference.chunks.resident().get(key).mesh);
  c.dispose();
  reference.chunks.dispose();
});
test('pending hidden GPU upload survives compatible requests without duplicate upload or early picking', () => {
  const f = fixture(),
    c = f.chunks,
    gpu = uploader();
  c.request(['0,0']);
  const t = f.tx();
  gpu.uploads.stage(t.chunks);
  assert.equal(gpu.uploads.advance(262144, Infinity), false);
  const originalMeshes = gpu.meshes.slice(),
    calls = gpu.calls.length;
  assert.ok(calls > 0);
  c.request(['0,0', '5,5']);
  assert.equal(c.isCurrent(t), true);
  assert.strictEqual(f.tx(), t);
  assert.equal(c.ready(8, 8), false);
  assert.ok(gpu.parent.children.every((n) => !n.active));
  while (!gpu.uploads.advance(262144, Infinity)) {}
  t.commit();
  gpu.uploads.retain(c.cachedMeshes());
  gpu.uploads.publish();
  assert.ok(originalMeshes.every((m) => !m.destroyed));
  const reference = uploader();
  reference.uploads.stage(t.chunks);
  while (!reference.uploads.advance(262144, Infinity)) {}
  assert.equal(gpu.calls.length, reference.calls.length, 'each upload part created only once');
  assert.ok(gpu.parent.children.every((n) => n.active));
  c.dispose();
  gpu.uploads.dispose();
  reference.uploads.dispose();
  assert.ok(gpu.meshes.every((m) => m.destroyed === 1));
});
test('target, seam, error, edits, coast, anchors, abort and disposal invalidate pending cold work', () => {
  const partial = fixture();
  partial.chunks.request(['0,0'], []);
  partial.chunks.advance(4, Infinity);
  assert.ok(partial.chunks.jobs[0].cellJob, 'far cell generator is suspended');
  partial.chunks.request(['0,0', '1,0'], ['1,0']);
  assert.equal(partial.chunks.jobs, null, 'changed neighbor cancels the suspended generator');
  assert.equal(partial.chunks.memoryUsage().staging, 0);
  partial.settle(['0,0', '1,0'], ['1,0']);
  const reference = fixture();
  reference.settle(['0,0', '1,0'], ['1,0']);
  assert.deepEqual(
    partial.chunks.resident().get('0,0').mesh,
    reference.chunks.resident().get('0,0').mesh,
  );
  partial.chunks.dispose();
  reference.chunks.dispose();
  const cases = {
    offscreen: (c) => c.request(['5,5'], []),
    ownLOD: (c) => c.request(['0,0'], ['0,0']),
    neighborLOD: (c) => c.request(['0,0', '1,0'], ['1,0']),
    error: (c) => c.request(['0,0'], [], 0.1),
    edit: (c) => c.update(source(true), [{ x: 15, z: 8 }]),
    coast: (c, f) => c.update(source(true), [{ x: 15, z: 8 }], f.coast),
    anchor: (c) => c.setVisualCells(new Set(['15,8'])),
    abort: (c) => c.abort(),
    dispose: (c) => c.dispose(),
  };
  for (const [name, change] of Object.entries(cases)) {
    const f = fixture(),
      c = f.chunks;
    c.request(['0,0'], []);
    const t = f.tx();
    change(c, f);
    assert.equal(c.isCurrent(t), false, name);
    assert.throws(() => t.commit(), /Stale/, name);
    assert.equal(c.memoryUsage().staging, 0, name);
    assert.equal(c.ready(8, 8), false, name);
    c.dispose();
  }
});
test('an invalid neighbor cancels the entire seam group; eviction jobs cannot return as empty builds', () => {
  const f = fixture(),
    c = f.chunks;
  f.settle(f.coast.keys, []);
  c.request(f.coast.keys, ['0,0']);
  const t = f.tx();
  c.request(f.coast.keys, ['0,0', '1,0']);
  assert.throws(() => t.commit(), /Stale/);
  f.settle(f.coast.keys);
  c.request([], []);
  const evict = f.tx();
  c.request(f.coast.keys);
  assert.throws(() => evict.commit(), /Stale/);
  f.settle(f.coast.keys);
  assert.ok(c.resident().get('0,0').mesh.indices.length > 0);
  c.dispose();
});
test('retained work remains under the original budget and abort frees it after admission failure', () => {
  const f = fixture(new V6SurfaceBudget(100000)),
    c = f.chunks;
  c.request(['0,0']);
  c.advance(5, Infinity);
  const usage = c.memoryUsage();
  assert.ok(usage.staging > 0);
  for (let i = 0; i < 100; i++) c.request(['0,0', '5,5'], i % 2 ? ['0,0'] : ['0,0', '5,5']);
  assert.deepEqual(c.memoryUsage(), usage);
  assert.throws(() => c.advance(10000, Infinity), V6SurfaceBudgetError);
  const failed = c.memoryUsage();
  assert.ok(failed.resident + failed.staging <= failed.limit);
  c.abort();
  assert.equal(c.memoryUsage().staging, 0);
  c.dispose();
  assert.equal(c.memoryUsage().resident, 0);
});
