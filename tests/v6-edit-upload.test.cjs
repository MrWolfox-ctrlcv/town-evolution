const test = require('node:test');
const assert = require('node:assert/strict');
const { V6SurfaceChunks } = require('../.domain-build/art/V6SurfaceChunks');
const {
  V6SurfaceBudget,
  V6SurfaceBudgetError,
  v6SurfaceCost,
} = require('../.domain-build/art/V6SurfaceBudget');
const {
  v6RenderBatches,
  v6FineRenderBatches,
  prepareV6RenderBatches,
  v6RenderBatchCost,
} = require('../.domain-build/art/V6RenderBatches');
const { iterateV6UploadParts, v6MeshBytes } = require('../.domain-build/art/V6MeshUploadParts');
const { buildV6SurfaceMesh } = require('../.domain-build/art/V6SurfaceMesh');
const { V6TerrainPicking } = require('../.domain-build/application/V6TerrainPicking');
const uploader = require('./helpers/v6-upload-fixture.cjs');
function source(edits = new Map(), holes = new Set(), depleted = new Set()) {
  const resource = (x, z) =>
    depleted.has(`${x},${z}`) ? null : { id: `n${x}_${z}`, x, z, kind: 'stone', amount: 3 };
  const world = {
    seed: 1,
    size: 192,
    at: (x, z) =>
      x >= 0 && z >= 0 && x < 192 && z < 192 && !holes.has(`${x},${z}`)
        ? { reserved: false }
        : null,
    groundHeight: () => 2,
    naturalHeight: () => 5,
    normal: () => [-0, 1, 0],
    resourceAt: resource,
  };
  const retainedHeightInCell = (_x, _z, x, z) =>
    Math.min(depleted.has(`${x},${z}`) ? 2 : 5, edits.get(`${x},${z}`)?.cut ?? Infinity);
  return {
    world,
    revision: 'unchanged',
    capAt: (x, z) => (depleted.has(`${x},${z}`) ? -Infinity : Infinity),
    resourceAt: resource,
    editAt: (x, z) => edits.get(`${x},${z}`) ?? null,
    retainedHeightInCell,
    heightInCell: (xx, zz, x, z) =>
      edits.has(`${x},${z}`)
        ? Math.fround(0.015 + edits.get(`${x},${z}`).level)
        : retainedHeightInCell(xx, zz, x, z),
  };
}
const empty = () => ({
  positions: [],
  normals: [],
  colors: [],
  indices: [],
  min: [0, 0, 0],
  max: [0, 0, 0],
});
const coast = { keys: ['0,0', '1,0'], begin: () => ({ advance: () => true, result: empty }) };
function fixture(s = source(), budget) {
  const chunks = new V6SurfaceChunks(s, coast, budget),
    gpu = uploader();
  function tx() {
    for (let i = 0; i < 100; i++) {
      const t = chunks.advance(100000, Infinity);
      gpu.uploads.retain(chunks.cachedMeshes());
      if (t) return t;
    }
    throw Error('stalled');
  }
  function publish(t) {
    gpu.uploads.stage(t.chunks);
    let bytes = 0;
    while (true) {
      const done = gpu.uploads.advance(65536, Infinity);
      bytes += gpu.uploads.lastAdvanceBytes;
      if (done) break;
    }
    t.commit();
    gpu.uploads.retain(chunks.cachedMeshes());
    gpu.uploads.publish();
    return bytes;
  }
  function settle(keys = ['0,0'], fine = keys) {
    chunks.request(keys, fine);
    let bytes = 0;
    while (!chunks.isSettled()) bytes += publish(tx());
    return bytes;
  }
  return { chunks, gpu, tx, publish, settle };
}
const vertex = (mesh, id) => [
  ...mesh.positions.slice(id * 3, id * 3 + 3),
  ...mesh.normals.slice(id * 3, id * 3 + 3),
  ...mesh.colors.slice(id * 4, id * 4 + 4),
  ...(mesh.uvs?.slice(id * 2, id * 2 + 2) ?? [0, 0]),
];
function checkGeometry(mesh) {
  const covered = [],
    actual = new Map();
  for (const batch of v6RenderBatches(mesh)) {
    const ids = batch.ranges.flatMap((r) =>
      Array.from({ length: r.end - r.start }, (_, i) => r.start + i),
    );
    covered.push(...ids);
    const parts = [...iterateV6UploadParts(mesh, 65536, batch.ranges)],
      expected = ids.flatMap((t) =>
        mesh.indices.slice(t * 3, t * 3 + 3).map((id) => vertex(mesh, id)),
      );
    assert.deepEqual(
      parts.flatMap((p) => p.indices.map((id) => vertex(p, id))),
      expected,
      'bit-exact expanded attributes including signed zero',
    );
    assert.equal(
      parts.reduce((n, p) => n + v6MeshBytes(p), 0),
      batch.bytes,
    );
    assert.equal(parts.length, batch.parts);
    for (const p of parts) {
      assert.ok(v6MeshBytes(p) <= 65536);
      for (let i = 0; i < p.positions.length; i++)
        assert.ok(p.positions[i] >= p.min[i % 3] && p.positions[i] <= p.max[i % 3]);
    }
    for (const id of ids) actual.set(id, mesh.triangles[id]);
  }
  assert.deepEqual(
    covered.sort((a, b) => a - b),
    Array.from({ length: mesh.triangles.length }, (_, i) => i),
    'every triangle exactly once',
  );
  assert.deepEqual(
    [...actual].sort((a, b) => a[0] - b[0]).map(([, meta]) => meta),
    mesh.triangles,
    'wall/material/resource ownership preserved',
  );
}
test('fine batches partition canonical attributes exactly and charge actual split duplication', () => {
  const edits = new Map([
      [
        '7,3',
        {
          cut: 2.015,
          level: 15,
          fills: Array.from({ length: 13 }, (_, i) => ({
            level: i + 3,
            material: i % 2 ? 'soil' : 'stone',
          })),
        },
      ],
    ]),
    s = source(edits),
    f = fixture(s);
  f.settle();
  const mesh = f.chunks.resident().get('0,0').mesh;
  assert.equal(v6FineRenderBatches(mesh).length, 8);
  checkGeometry(mesh);
  assert.ok(v6RenderBatchCost(mesh) > 0);
  assert.equal(f.chunks.memoryUsage().resident, v6SurfaceCost(mesh));
  const reference = buildV6SurfaceMesh(s, 0, 0, 16, 16);
  assert.deepEqual(
    mesh.indices.map((id) => vertex(mesh, id)),
    reference.indices.map((id) => vertex(reference, id)),
  );
  assert.deepEqual(mesh.triangles, reference.triangles);
  assert.ok(
    v6RenderBatches(mesh).some((b) => b.parts > 1),
    'oversized bin still splits at 64KiB',
  );
});
test('interior, bin-edge and chunk-edge edits reuse only untouched GPU tokens with atomic authority', () => {
  for (const [x, z, count] of [
    [3, 2, 1],
    [8, 8, 3],
    [15, 8, 3],
  ]) {
    const f = fixture(),
      keys = x === 15 ? ['0,0', '1,0'] : ['0,0'];
    f.settle(keys);
    const old = new Map([...f.chunks.resident()].map(([key, c]) => [key, c])),
      oldTokens = new Set(
        [...old.values()].flatMap((c) => v6RenderBatches(c.mesh).map((b) => b.token)),
      ),
      oldNodes = f.gpu.parent.children.slice();
    const edits = new Map([[`${x},${z}`, { cut: 2.015, level: 2, fills: [] }]]);
    f.chunks.update(source(edits), [{ x, z }]);
    const t = f.tx();
    assert.equal(t.rebuiltCells, 5);
    const fresh = t.chunks
      .flatMap((c) => v6RenderBatches(c.mesh))
      .filter((b) => !oldTokens.has(b.token));
    assert.equal(fresh.length, count);
    f.gpu.uploads.stage(t.chunks);
    assert.equal(f.gpu.uploads.advance(0, Infinity), false);
    assert.throws(() => f.gpu.uploads.publish(), /Incomplete/);
    assert.ok(oldNodes.every((n) => n.active && !n.destroyed));
    assert.strictEqual(f.chunks.resident().get('0,0'), old.get('0,0'));
    assert.equal(f.chunks.ready(x, z), false);
    let bytes = 0;
    while (true) {
      const done = f.gpu.uploads.advance(65536, Infinity);
      bytes += f.gpu.uploads.lastAdvanceBytes;
      if (done) break;
    }
    assert.equal(
      bytes,
      fresh.reduce((n, b) => n + b.bytes, 0),
    );
    for (const c of t.chunks) checkGeometry(c.mesh);
    assert.ok(oldNodes.every((n) => n.active && !n.destroyed));
    t.commit();
    f.gpu.uploads.retain(f.chunks.cachedMeshes());
    f.gpu.uploads.publish();
    const picker = new V6TerrainPicking();
    picker.sync(f.chunks.resident().values());
    assert.equal(
      picker.pick({ o: { x: x + 0.5, y: 20, z: z + 0.5 }, d: { x: 0, y: -1, z: 0 } }).point.y,
      Math.fround(2.015),
    );
    assert.ok(f.gpu.parent.children.filter((n) => n.active).some((n) => oldNodes.includes(n)));
    for (const entry of f.gpu.uploads.entries.values())
      assert.deepEqual(Object.keys(entry).sort(), ['complete', 'meshes', 'nodes']);
    for (const token of f.gpu.uploads.entries.keys()) assert.deepEqual(Object.keys(token), []);
    f.chunks.dispose();
    f.gpu.uploads.dispose();
    assert.ok(f.gpu.meshes.every((m) => m.destroyed === 1));
  }
});
test('failed or cancelled cache-owned first upload cannot retain a partial GPU batch', () => {
  const f = fixture(source(new Map([['3,2', { cut: 2.015, level: 50, fills: [] }]])));
  f.chunks.request(['0,0']);
  const t = f.tx();
  t.commit();
  const mesh = f.chunks.resident().get('0,0').mesh;
  f.gpu.uploads.retain(new Set([mesh]));
  f.gpu.uploads.stage([{ key: '0,0', mesh }]);
  assert.equal(f.gpu.uploads.advance(65536, Infinity), false);
  f.gpu.uploads.cancel();
  assert.equal(f.gpu.parent.children.length, 0);
  assert.equal(f.gpu.uploads.entries.size, 0);
  assert.ok(f.gpu.meshes.every((m) => m.destroyed === 1));
  f.gpu.uploads.stage([{ key: '0,0', mesh }]);
  f.gpu.failOn(f.gpu.calls.length + 1);
  assert.throws(() => f.gpu.uploads.advance(262144, Infinity), /simulated/);
  assert.equal(f.gpu.uploads.entries.size, 0);
  f.gpu.failOn(Infinity);
  f.gpu.uploads.stage([{ key: '0,0', mesh }]);
  let bytes = 0;
  while (true) {
    const done = f.gpu.uploads.advance(262144, Infinity);
    bytes += f.gpu.uploads.lastAdvanceBytes;
    if (done) break;
  }
  assert.equal(
    bytes,
    v6RenderBatches(mesh).reduce((n, b) => n + b.bytes, 0),
  );
  f.gpu.uploads.publish();
  f.gpu.uploads.dispose();
  assert.ok(f.gpu.meshes.every((m) => m.destroyed === 1));
});
test('repeated edits, removed bins and LOD/cache eviction release shared entries exactly once', () => {
  const f = fixture();
  f.settle();
  let previous = f.chunks.resident().get('0,0');
  const edits = new Map();
  for (let i = 0; i < 5; i++) {
    edits.set('3,2', {
      cut: 2.015,
      level: 3 + i,
      fills: Array.from({ length: i + 1 }, (_, j) => ({ level: j + 3, material: 'soil' })),
    });
    f.chunks.update(source(edits), [{ x: 3, z: 2 }]);
    f.settle();
    const current = f.chunks.resident().get('0,0');
    assert.equal(
      v6RenderBatches(current.mesh).filter(
        (b, i) => b.token === v6RenderBatches(previous.mesh)[i].token,
      ).length,
      7,
    );
    previous = current;
    assert.equal(f.gpu.uploads.entries.size, 8);
  }
  const holes = new Set(),
    changed = [];
  for (let z = 0; z < 4; z++)
    for (let x = 0; x < 8; x++) {
      holes.add(`${x},${z}`);
      changed.push({ x, z });
    }
  f.chunks.update(source(edits, holes), changed);
  f.settle();
  assert.equal(v6RenderBatches(f.chunks.resident().get('0,0').mesh).length, 7);
  f.settle(['0,0'], []);
  assert.equal(v6FineRenderBatches(f.chunks.resident().get('0,0').mesh), undefined);
  assert.equal(f.settle(), 0, 'complete hot fine snapshot remains reusable');
  f.settle([], []);
  f.gpu.uploads.retain(new Set());
  assert.equal(f.gpu.parent.children.length, 0);
  f.chunks.dispose();
  f.gpu.uploads.dispose();
  assert.ok(f.gpu.meshes.every((m) => m.destroyed === 1));
});
test('coast changes replace all fine tokens, and coast triangles have an independent complete batch', () => {
  const f = fixture();
  f.settle();
  const before = v6RenderBatches(f.chunks.resident().get('0,0').mesh).map((b) => b.token);
  const coastal = {
    ...coast,
    begin: () => ({
      advance: () => true,
      result: () => ({
        positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
        normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
        colors: Array(12).fill(1),
        indices: [0, 1, 2],
        min: [0, 0, 0],
        max: [1, 0, 1],
      }),
    }),
  };
  f.chunks.update(source(), [{ x: 3, z: 2 }], coastal);
  f.settle();
  const mesh = f.chunks.resident().get('0,0').mesh,
    batches = v6RenderBatches(mesh);
  assert.equal(batches.length, 9);
  assert.equal(batches[0].key, 'coast');
  assert.ok(batches.every((b) => !before.includes(b.token)));
  checkGeometry(mesh);
});
test('batch accounting admission fails before publication and abort clears staging', () => {
  const original = fixture();
  original.settle();
  const mesh = original.chunks.resident().get('0,0').mesh;
  const budget = new V6SurfaceBudget(2 * v6SurfaceCost(mesh) - v6RenderBatchCost(mesh) - 1),
    f = fixture(source(), budget);
  f.chunks.request(['0,0']);
  assert.throws(() => f.tx(), V6SurfaceBudgetError);
  assert.equal(f.chunks.resident().size, 0);
  assert.equal(f.gpu.parent.children.length, 0);
  f.chunks.abort();
  assert.equal(budget.usage().staging, 0);
});
test('range iteration rejects malformed spans and empty batch layouts remove old GPU nodes', () => {
  const mesh = {
    positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
    colors: Array(12).fill(1),
    indices: [0, 1, 2],
    min: [0, 0, 0],
    max: [1, 0, 1],
  };
  for (const range of [
    { start: -1, end: 1 },
    { start: 0, end: 2 },
    { start: 0.5, end: 1 },
    { start: 1, end: 0 },
  ])
    assert.throws(() => [...iterateV6UploadParts(mesh, 65536, [range])], /range/);
  const f = uploader();
  f.uploads.stage([{ key: 'a', mesh }]);
  f.uploads.advance(65536, Infinity);
  f.uploads.publish();
  const gone = empty();
  [...prepareV6RenderBatches(gone, new Map(), null, undefined, [])];
  f.uploads.stage([{ key: 'a', mesh: gone }]);
  assert.equal(f.uploads.advance(0, 0), true);
  f.uploads.publish();
  assert.equal(f.parent.children.length, 0);
  assert.ok(f.meshes.every((m) => m.destroyed === 1));
});

test('completed cached batches survive group cancellation, but pending pins outlive cache trimming', () => {
  const f = fixture();
  f.chunks.request(['0,0']);
  const t = f.tx();
  t.commit();
  const mesh = f.chunks.resident().get('0,0').mesh;
  f.gpu.uploads.retain(new Set([mesh]));
  f.gpu.uploads.stage([{ key: '0,0', mesh }]);
  assert.equal(f.gpu.uploads.advance(65536, Infinity), false);
  const firstBytes = f.gpu.uploads.lastAdvanceBytes;
  f.gpu.uploads.cancel();
  assert.ok(f.gpu.uploads.entries.size > 0);
  assert.ok([...f.gpu.uploads.entries.values()].every((e) => e.complete));
  assert.ok(f.gpu.parent.children.every((n) => !n.active));
  const nodes = f.gpu.parent.children.slice();
  f.gpu.uploads.stage([{ key: '0,0', mesh }]);
  f.gpu.uploads.retain(new Set());
  assert.ok(nodes.every((n) => !n.destroyed));
  let bytes = 0;
  while (true) {
    const done = f.gpu.uploads.advance(65536, Infinity);
    bytes += f.gpu.uploads.lastAdvanceBytes;
    if (done) break;
  }
  assert.equal(
    firstBytes + bytes,
    v6RenderBatches(mesh).reduce((n, b) => n + b.bytes, 0),
  );
  f.gpu.uploads.retain(new Set());
  assert.ok(nodes.every((n) => !n.destroyed));
  f.gpu.uploads.publish();
  assert.ok(nodes.every((n) => n.active && !n.destroyed));
  f.gpu.uploads.dispose();
  assert.ok(f.gpu.meshes.every((m) => m.destroyed === 1));
});
test('mixed reused and new batches cancel or fail without touching the displayed snapshot', () => {
  const f = fixture();
  f.settle();
  const nodes = f.gpu.parent.children.slice(),
    old = f.chunks.resident().get('0,0');
  f.chunks.update(source(new Map([['8,8', { cut: 2.015, level: 2, fills: [] }]])), [
    { x: 8, z: 8 },
  ]);
  let t = f.tx();
  f.gpu.uploads.stage(t.chunks);
  assert.equal(f.gpu.uploads.advance(65536, Infinity), false);
  f.gpu.uploads.cancel();
  f.chunks.abort();
  assert.deepEqual(f.gpu.parent.children, nodes);
  assert.ok(nodes.every((n) => n.active && !n.destroyed));
  assert.throws(() => t.commit(), /Stale/);
  t = f.tx();
  f.gpu.uploads.stage(t.chunks);
  f.gpu.failOn(f.gpu.calls.length + 1);
  assert.throws(() => f.gpu.uploads.advance(262144, Infinity), /simulated/);
  assert.deepEqual(f.gpu.parent.children, nodes);
  assert.strictEqual(f.chunks.resident().get('0,0'), old);
  assert.ok(nodes.every((n) => n.active && !n.destroyed));
  f.gpu.failOn(Infinity);
  f.publish(t);
  f.gpu.uploads.dispose();
  assert.ok(f.gpu.meshes.every((m) => m.destroyed === 1));
});
