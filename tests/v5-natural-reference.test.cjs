const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { assertV5Reference } = require('./helpers/assert-v5-reference.cjs');
const fixture = require('./fixtures/v5-phase1-reference.json');
const {
  getV5World,
  getV5BaseWorld,
  V5_GENERATOR_REVISION,
} = require('../.domain-build/domain/v5-world');
const { createV5Foundation } = require('../.domain-build/domain/v5-foundation');
const frozenPayloads = JSON.parse(
  zlib.gunzipSync(fs.readFileSync(`${__dirname}/fixtures/v5-phase1-reference-payloads.json.gz`)),
);
const allCells = (w) =>
  Array.from({ length: 192 * 192 }, (_, i) => w.at(i % 192, Math.floor(i / 192)));
test('frozen phase1 oracle retains every cell, stock and candidate across six seeds', () => {
  assert.deepEqual(
    frozenPayloads.map((f) => f.seed),
    fixture.seeds.map((f) => f.seed),
  );
  for (const f of fixture.seeds) {
    const w = getV5BaseWorld(f.seed);
    assert.equal(w.revision, fixture.revision);
    const resources = w.recipe.resourcesForNewWorld();
    const frozen = frozenPayloads.find((entry) => entry.seed === f.seed).payload;
    // Authenticate the expanded oracle against the original, unchanged phase1 hash.
    const sha = crypto.createHash('sha256').update(JSON.stringify(frozen)).digest('hex');
    assert.equal(sha, f.sha256, `frozen seed ${f.seed}`);
    assertV5Reference({ cells: allCells(w), trees: w.treeCandidates, resources }, frozen);
    assert.equal(resources.length, f.resourceCount);
    assert.equal(w.treeCandidates.length, f.treeCandidateCount);
  }
});
test('natural coast changes only feature region and excludes all reserved initial stock and trees', () => {
  assert.equal(V5_GENERATOR_REVISION, 'v5-natural-coast-starter-1');
  const report = [];
  for (const { seed } of fixture.seeds) {
    const old = getV5BaseWorld(seed),
      w = getV5World(seed),
      h = w.hydrology;
    const b = h.featureBounds;
    assert.ok(b && h.feature);
    let changed = 0,
      reserved = 0;
    for (let z = 0; z < 192; z++)
      for (let x = 0; x < 192; x++) {
        const before = old.at(x, z),
          after = w.at(x, z);
        const outside = x + 1 <= b.x0 || x >= b.x1 || z + 1 <= b.z0 || z >= b.z1;
        if (outside) assert.deepEqual(after, before, `outside feature ${seed}:${x},${z}`);
        if (JSON.stringify(before) !== JSON.stringify(after)) changed++;
        if (h.reserveCell(x, z)) {
          reserved++;
          assert.equal(w.recipe.initialStock(x, z), 0);
          if (after) {
            assert.equal(after.biome, 'plain');
            assert.equal(after.surfaceHeight, 0);
          }
        }
        if (after) assert.equal(after.elevation, w.recipe.initialStock(x, z));
      }
    assert.ok(changed > 0 && reserved > 0);
    const foundation = createV5Foundation(seed);
    for (const r of foundation.naturalResources) {
      assert.equal(r.id, `n${r.x}_${r.z}`);
      assert.equal(h.reserveCell(r.x, r.z), false);
      assert.equal(h.at(r.x, r.z).state, 'dryBuildable');
      assert.equal(r.amount, w.recipe.initialStock(r.x, r.z));
      assert.equal(
        r.amount,
        Math.max(1, Math.ceil(w.recipe.naturalHeight(r.x + 0.5, r.z + 0.5) - 0.015)),
      );
    }
    foundation.trees.forEach((t, i) => {
      assert.equal(t.id, `t${i + 1}`);
      assert.equal(h.reserveCell(t.x, t.z), false);
      assert.equal(h.at(t.x, t.z).state, 'dryBuildable');
    });
    const oldCandidates = new Set(old.treeCandidates.map((t) => `${t.x},${t.z}`));
    const newCandidates = new Set(w.treeCandidates.map((t) => `${t.x},${t.z}`));
    for (const key of new Set([...oldCandidates, ...newCandidates])) {
      const [x, z] = key.split(',').map(Number);
      if (x + 1 <= b.x0 || x >= b.x1 || z + 1 <= b.z0 || z >= b.z1)
        assert.equal(newCandidates.has(key), oldCandidates.has(key));
    }
    report.push({
      seed,
      changed,
      reserved,
      resources: foundation.naturalResources.length,
      trees: foundation.trees.length,
    });
  }
  console.log('New natural-coast reference differences:', JSON.stringify(report));
});
