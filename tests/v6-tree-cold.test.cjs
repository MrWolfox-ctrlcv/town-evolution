/** Pre-change Float64 goldens cover geometry, picking and actual upload parts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { V6TreeBatchBuilder } = require('../.domain-build/art/V6TreeGeometry');
const upload = require('../.domain-build/art/V6MeshUploadParts');
const { v6TreeCacheCost, V6TreeCache } = require('../.domain-build/application/V6TreeCache');
const { fingerprint } = require('./helpers/v6-tree-fingerprint.cjs');
const goldens = require('./fixtures/v6-tree-cold-goldens.json');
for (const fixture of goldens.cases) {
  test(`first-visit scalar tree transform preserves all Float64 geometry, picks and upload bytes: ${fixture.name}`, () => {
    const before = JSON.stringify(fixture.trees);
    let samples = 0;
    const b = new V6TreeBatchBuilder(
      fixture.seed,
      fixture.trees,
      fixture.far,
      () => fixture.heights[samples++],
    );
    if (fixture.trees.length) assert.throws(() => b.finish(), /not complete/);
    for (let i = 0; i < fixture.trees.length; i++) {
      assert.equal(b.complete, false);
      b.append();
    }
    assert.equal(b.complete, true);
    const batch = b.finish();
    assert.equal(samples, fixture.trees.length);
    assert.equal(JSON.stringify(fixture.trees), before);
    assert.deepEqual(
      [...batch.surfaces.keys()],
      fixture.trees.map((t) => t.id),
    );
    assert.deepEqual(fingerprint(batch, upload), fixture.expected);
    const entry = { signature: JSON.stringify(fixture.trees), far: fixture.far, batch };
    const cost = v6TreeCacheCost(entry),
      cache = new V6TreeCache(cost);
    cache.remember('fixture', entry);
    assert.equal(cache.usage().bytes, cost);
    cache.clear();
    assert.equal(cache.usage().bytes, 0);
  });
}
