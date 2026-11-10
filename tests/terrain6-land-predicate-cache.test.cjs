const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildTerrainData } = require('../.domain-build/domain/v6-build-terrain');
const { V6TerrainBuilder } = require('../.domain-build/domain/v6-terrain-builder');
const { V6Hydrology } = require('../.domain-build/domain/v6-hydrology');
const worlds = require('../.domain-build/domain/v6-world');
const game = require('../.domain-build/domain/game');
const baseline = require('./fixtures/terrain6-worker-baseline.json');
const seed = baseline.seed;
let dto, prepared, land, water;
function drain(iterator) {
  for (;;) {
    const result = iterator.next();
    if (result.done) return result.value;
  }
}
function fromTransfer(data, sourceSeed = seed) {
  const builder = V6TerrainBuilder.fromTransfer(sourceSeed, data);
  while (builder.step(50000).status !== 'ready') {}
  const result = builder.takeResult();
  worlds.publishPreparedV6World(result);
  return result;
}
before(() => {
  dto = drain(buildTerrainData(seed));
  prepared = fromTransfer(dto);
  const world = prepared.terrain;
  for (let z = 1; z < world.size - 1; z++)
    for (let x = 1; x < world.size - 1; x++) {
      if (!land && world.at(x, z) && !world.at(x, z).resource) land = { x, z };
      if (!water && world.hydrology.at(x, z).state !== 'dryBuildable') water = { x, z };
      if (land && water) return;
    }
});

test('v6 whole-grid land predicates match original hydrology and need no warm reclassification', () => {
  const world = prepared.terrain,
    original = V6Hydrology.prototype.at;
  const expected = Array.from({ length: world.size ** 2 }, (_, index) => {
    const x = index % world.size,
      z = Math.floor(index / world.size);
    return (
      x >= 1 &&
      z >= 1 &&
      x < world.size - 1 &&
      z < world.size - 1 &&
      original.call(world.hydrology, x, z).state === 'dryBuildable'
    );
  });
  let calls = 0;
  V6Hydrology.prototype.at = function (...args) {
    calls++;
    return original.apply(this, args);
  };
  try {
    for (let round = 0; round < 2; round++) {
      const beforeCalls = calls;
      for (let index = 0; index < expected.length; index++)
        assert.equal(
          game.isLandCell(index % world.size, Math.floor(index / world.size), seed, 6),
          expected[index],
        );
      if (round === 1) assert.equal(calls, beforeCalls);
    }
    assert.equal(calls, (world.size - 2) ** 2);
  } finally {
    V6Hydrology.prototype.at = original;
  }
});

test('mutable extensions are evaluated independently and invalid coordinates never alias a cell', () => {
  const extensions = [];
  assert.equal(game.isLandCell(water.x, water.z, seed, 6, extensions), false);
  extensions.push({ ...water });
  assert.equal(game.isLandCell(water.x, water.z, seed, 6, extensions), true);
  extensions.pop();
  assert.equal(game.isLandCell(water.x, water.z, seed, 6, extensions), false);
  for (const [x, z] of [
    [0, 1],
    [191, 1],
    [1, 191],
    [-1, 2],
    [1.2, 2],
    [NaN, 2],
    [2, Infinity],
    [1e10, 2],
  ])
    assert.equal(game.isLandCell(x, z, seed, 6, [{ x, z }]), false);
  assert.throws(() => game.isLandCell(2, 2, 999999937, 6), /finish preparation/);
});

test('warm strict saves retain frozen byte identity and still reject water and forged resource input', () => {
  const state = game.createGame(60000, seed, 6),
    bytes = game.exportSave(state);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), baseline.saveHash);
  assert.equal(game.exportSave(game.importSave(bytes, 60000)), bytes);
  const submerged = JSON.parse(bytes);
  Object.assign(submerged.trees[0], water);
  assert.throws(() => game.importSave(JSON.stringify(submerged), 60000), /水域/);
  assert.throws(() => game.exportSave(submerged), /水域/);
  const forged = JSON.parse(bytes);
  forged.naturalResources[0].amount = 65;
  assert.throws(() => game.importSave(JSON.stringify(forged), 60000), /天然资源/);
});

test('same-seed replacement derives a fresh predicate from hydrology, never from transferred cells', () => {
  const index = water.z * prepared.terrain.size + water.x;
  const changed = { ...dto, complete: { ...dto.complete, cells: [...dto.complete.cells] } };
  changed.complete.cells[index] = { ...prepared.terrain.at(land.x, land.z), ...water };
  const replacement = fromTransfer(changed);
  assert.notEqual(replacement.terrain, prepared.terrain);
  assert.ok(
    replacement.terrain.at(water.x, water.z),
    'Transfer shape alone is not a land certificate',
  );
  const original = V6Hydrology.prototype.at;
  let calls = 0;
  V6Hydrology.prototype.at = function (...args) {
    if (this === replacement.terrain.hydrology) calls++;
    return original.apply(this, args);
  };
  try {
    assert.equal(game.isLandCell(water.x, water.z, seed, 6), false);
    assert.equal(calls, 1, 'Same seed with another world must not reuse the old mask');
    changed.complete.cells[index] = null;
    assert.equal(game.isLandCell(water.x, water.z, seed, 6), false);
    assert.equal(calls, 1);
  } finally {
    V6Hydrology.prototype.at = original;
    worlds.publishPreparedV6World(prepared);
  }
});

test('different seeds have independent predicates even when transfer cell arrays are shared inputs', () => {
  const otherSeed = seed + 1;
  const other = fromTransfer(
    { ...dto, seed: otherSeed, feature: { ...dto.feature, seed: otherSeed } },
    otherSeed,
  );
  let different = null;
  for (let z = 1; z < 191 && !different; z++)
    for (let x = 1; x < 191 && !different; x++) {
      const a = prepared.terrain.hydrology.at(x, z).state === 'dryBuildable';
      const b = other.terrain.hydrology.at(x, z).state === 'dryBuildable';
      if (a !== b) different = { x, z, a, b };
    }
  assert.ok(different);
  const { x, z, a, b } = different;
  assert.equal(game.isLandCell(x, z, seed, 6), a);
  assert.equal(game.isLandCell(x, z, otherSeed, 6), b);
  assert.equal(game.isLandCell(x, z, seed, 6), a);
});

test('v1 through v5 land predicates never access the v6 world cache', () => {
  const original = worlds.getV6World;
  const before = [];
  for (const version of [1, 2, 3, 4, 5])
    for (const [x, z] of [
      [3, 3],
      [12, 12],
      [30, 30],
      [0, 0],
    ])
      before.push({ version, x, z, value: game.isLandCell(x, z, 1, version) });
  worlds.getV6World = () => assert.fail('Old-world lookup touched v6');
  try {
    for (const { version, x, z, value } of before)
      assert.equal(game.isLandCell(x, z, 1, version), value);
  } finally {
    worlds.getV6World = original;
  }
});
