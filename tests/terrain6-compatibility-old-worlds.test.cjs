/** Frozen pre-terrain6 schema10 evidence. Never regenerate old oracles to fit new code. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const g = require('../.domain-build/domain/game');
const { getV5World, V5_GENERATOR_REVISION } = require('../.domain-build/domain/v5-world');
const { assertV5Reference } = require('./helpers/assert-v5-reference.cjs');
const manifest = require('./fixtures/terrain6-legacy-oracle.json');
const hash = (value) =>
  crypto
    .createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex');
const packed = fs.readFileSync(path.join(__dirname, 'fixtures/terrain6-legacy-oracle.json.gz'));
assert.equal(hash(packed), manifest.fixtureSha256, 'Independent frozen evidence must not drift');
const oracle = JSON.parse(zlib.gunzipSync(packed));
// Expanded only from the original pre-v6 oracle, never from the implementation under test.
// Every cell list is authenticated against its original manifest SHA below.
const worldBytes = fs.readFileSync(
  path.join(__dirname, 'fixtures/terrain6-legacy-v5-worlds.json.gz'),
);
assert.equal(hash(worldBytes), '3bda41881cf43a30fe40d6ded66d9139d485350424ba2de48c0b2da4ec99a4fd');
const frozenV5Worlds = JSON.parse(zlib.gunzipSync(worldBytes));
assert.equal(oracle.records.length, 25);
assert.equal(manifest.v5Revision, 'v5-natural-coast-starter-1');

for (const expected of manifest.records)
  test(`terrain6 preserves every v${expected.version} cell and saved identity, seed ${expected.seed}`, () => {
    const { version, seed, size } = expected;
    const record = oracle.records.find((r) => r.version === version && r.seed === seed);
    const state = g.createGame(record.now, seed, version);
    assert.equal(
      g.exportSave(state),
      record.initial,
      'Full schema10 byte order and values remain exact',
    );
    assert.equal(hash(record.initial), expected.saveHash);
    assert.equal(hash(record.depleted), expected.depletedSaveHash);
    assert.equal(g.worldSize(version), size);
    assert.equal(state.trees.length, expected.treeCount);
    assert.equal(state.naturalResources.length, expected.resourceCount);
    const land = [],
      terrain = [];
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        land.push(g.isLandCell(x, z, seed, version) ? 1 : 0);
        terrain.push(g.terrainAt(x, z, seed, version));
      }
    assert.equal(hash(land), expected.landHash, 'No old land, lake, river or coastline moves');
    assert.equal(hash(terrain), expected.terrainHash, 'All old biomes and elevations remain exact');
    assert.equal(g.exportSave(g.createGame(record.now, seed)), record.defaultSave);
    assert.equal(g.createGame(record.now, seed).terrainVersion, 4, 'Default entry remains v4');
    let depleted = state;
    for (const command of record.commands) {
      const before = g.exportSave(depleted);
      const result = g.dispatch(depleted, command, record.now);
      assert.equal(result.ok, true, result.error);
      assert.equal(g.exportSave(depleted), before, 'Commands keep old snapshots immutable');
      depleted = result.state;
    }
    assert.equal(
      g.exportSave(depleted),
      record.depleted,
      'Real depleted cells and unpicked drops retain IDs',
    );
    for (const bytes of [record.initial, record.depleted]) {
      let restored = g.importSave(bytes, record.now);
      assert.equal(g.exportSave(restored), bytes);
      for (let i = 0; i < 3; i++) restored = g.importSave(g.exportSave(restored), record.now);
      assert.equal(
        g.exportSave(restored),
        bytes,
        'Repeated reload cannot resurrect or reseed anything',
      );
      assert.deepEqual(g.importSave(bytes, record.now + 3600000), {
        ...JSON.parse(bytes),
        lastSeenAt: record.now + 3600000,
      });
    }
    if (version !== 5) return;
    assert.equal(V5_GENERATOR_REVISION, manifest.v5Revision);
    const world = getV5World(seed);
    const actual = {
      revision: world.revision,
      world: [],
      hydrology: [],
      fields: [],
      stock: [],
      treeCandidates: world.treeCandidates,
    };
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        actual.world.push(world.at(x, z));
        actual.hydrology.push(world.hydrology.at(x, z));
        actual.fields.push(world.hydrology.fields(x + 0.5, z + 0.5));
        actual.stock.push(world.recipe.initialStock(x, z));
      }
    for (const [kind, value] of Object.entries(actual)) {
      if (kind === 'world') {
        const frozen = frozenV5Worlds.find((entry) => entry.seed === seed).cells;
        assert.equal(
          hash(frozen),
          expected.v5Hashes.world,
          'Original cell payload SHA is unchanged',
        );
        // Same Node/V8 as capture retains the strongest original byte-level assertion.
        // Node22's independently reproduced pow difference is limited to surfaceHeight.
        if (process.version === 'v24.22.1' && process.versions.v8 === '13.6.233.17-node.58')
          assert.equal(hash(value), expected.v5Hashes.world);
        assertV5Reference({ cells: value }, { cells: frozen });
      } else
        assert.equal(
          hash(value),
          expected.v5Hashes[kind],
          `The frozen v5 ${kind} cannot be reinterpreted`,
        );
    }
  });
