const test = require('node:test'),
  assert = require('node:assert/strict');
const { getV5BaseWorld } = require('../.domain-build/domain/v5-world');
const {
  createV5Foundation,
  allocateV5Foundation,
} = require('../.domain-build/domain/v5-foundation');
const { V5ResourceChunks } = require('../.domain-build/art/V5ResourceChunks');
const { NaturalPicking } = require('../.domain-build/application/NaturalPicking');
const { v5UploadParts, v5MeshBytes } = require('../.domain-build/art/V5MeshUploadParts');
function finish(chunks, max = 10000) {
  for (let n = 0; n < max; n++) {
    const tx = chunks.advance(8, Infinity);
    if (tx) return tx;
  }
  throw Error('Chunk preparation did not finish');
}
test('v5 preserves frozen main-island stocks and adds only explicit safe starter pockets', () => {
  for (const [seed, count] of [
    [1, 8830],
    [17, 8556],
    [1937, 8837],
    [42173, 8535],
    [999999937, 8690],
    [1000000000, 8617],
  ]) {
    const w = getV5BaseWorld(seed),
      foundation = allocateV5Foundation(w.reference, w.treeCandidates, [], 1, w.recipe),
      main = foundation.naturalResources.filter((r) => r.x >= 36 || r.z >= 36);
    assert.equal(main.length, count);
    assert.ok(foundation.naturalResources.some((r) => r.x < 36 && r.z < 36 && r.kind === 'stone'));
    assert.ok(foundation.naturalResources.some((r) => r.x < 36 && r.z < 36 && r.kind === 'soil'));
    assert.equal(foundation.trees.filter((t) => t.x < 36 && t.z < 36).length, 18);
    for (const r of foundation.naturalResources) {
      assert.equal(w.hydrology.at(r.x, r.z).state, 'dryBuildable');
      assert.equal(r.amount, w.recipe.initialStock(r.x, r.z));
      assert.equal(
        r.amount,
        Math.max(1, Math.ceil(w.recipe.naturalHeight(r.x + 0.5, r.z + 0.5) - 0.015)),
      );
    }
    assert.ok(foundation.trees.every((t) => /^t[1-9][0-9]*$/.test(t.id)));
  }
});
test('real v5 patch budgets, local group publication, quantized picking and stale rejection', () => {
  const f = createV5Foundation(42173),
    chunks = new V5ResourceChunks(42173);
  let resources = f.naturalResources;
  const keys = ['5,4', '6,4', '5,5', '6,5'];
  chunks.update(resources);
  chunks.request(keys);
  assert.equal(chunks.advance(1, Infinity), null);
  assert.equal(chunks.surface().chunks.length, 0);
  const initial = finish(chunks);
  assert.equal(initial.chunks.length, 1);
  initial.commit();
  for (let n = 0; n < 10000 && !chunks.isSettled(); n++) {
    const tx = chunks.advance(8, Infinity);
    if (tx) tx.commit();
  }
  assert.ok(chunks.isSettled());
  const old = chunks.surface(),
    untouched = chunks.residentChunks().find((c) => c.key === '6,5');
  const r = resources.find((r) => r.id === 'n95_79');
  assert.ok(r);
  resources = resources.map((v) => (v.id === r.id ? { ...v, amount: v.amount - 1 } : v));
  chunks.update(resources);
  assert.strictEqual(chunks.surface(), old);
  const tx = finish(chunks);
  assert.equal(tx.rebuiltCells, 5);
  assert.deepEqual(tx.chunks.map((c) => c.key).sort(), ['5,4', '5,5', '6,4']);
  assert.strictEqual(chunks.surface(), old);
  const surface = tx.commit();
  assert.strictEqual(
    chunks.residentChunks().find((c) => c.key === '6,5'),
    untouched,
  );
  const picker = new NaturalPicking();
  picker.sync(surface, resources);
  const ray = { o: { x: r.x + 0.5, y: 70, z: r.z + 0.5 }, d: { x: 0, y: -1, z: 0 } },
    hit = picker.pick(ray);
  assert.equal(hit.id, r.id);
  assert.ok(Math.abs(hit.point.y - (r.amount - 1 + 0.015)) < 1e-5);
  assert.equal(picker.subset((b) => b.id === r.id).pick(ray).id, r.id);
  for (const c of tx.chunks) {
    assert.strictEqual(c.mesh.positions, c.surface.positions);
    for (const p of c.mesh.positions) assert.equal(p, Math.fround(p));
    const parts = v5UploadParts(c.mesh);
    assert.ok(parts.every((p) => v5MeshBytes(p) <= 65536 && p.positions.length / 3 < 65535));
    assert.equal(
      parts.reduce((n, p) => n + p.indices.length, 0),
      c.mesh.indices.length,
    );
    for (const owner of c.surface.resources)
      for (const index of owner.indices)
        for (let a = 0; a < 3; a++) {
          const v = c.mesh.positions[index * 3 + a];
          assert.ok(v >= owner.min[a] && v <= owner.max[a]);
        }
  }
  resources = resources.map((v) => (v.id === r.id ? { ...v, amount: v.amount - 1 } : v));
  chunks.update(resources);
  const stale = finish(chunks);
  resources = resources.map((v) => (v.id === r.id ? { ...v, amount: v.amount - 1 } : v));
  chunks.update(resources);
  assert.throws(() => stale.commit(), /Stale/);
  finish(chunks).commit();
  chunks.request(['6,5']);
  finish(chunks).commit();
  assert.equal(chunks.residentChunks().length, 1);
  chunks.request(['5,4']);
  finish(chunks).commit();
  picker.sync(chunks.surface(), resources);
  assert.ok(Math.abs(picker.pick(ray).point.y - (r.amount - 3 + 0.015)) < 1e-5);
  chunks.dispose();
  assert.equal(chunks.residentChunks().length, 0);
});
