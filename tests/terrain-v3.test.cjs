const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looseAmount } = require('./helpers/loose-output.cjs');
const { expectedSchema10 } = require('./helpers/expected-schema10.cjs');
const g = require('../.domain-build/domain/game');
const { titleIsland } = require('../.domain-build/application/TitleIsland');
const historical = require('./fixtures/terrain-v2-depleted.json');
function components(items) {
  const remaining = new Map(items.map((p) => [`${p.x},${p.z}`, p]));
  const result = [];
  while (remaining.size) {
    const first = remaining.values().next().value,
      queue = [first];
    remaining.delete(`${first.x},${first.z}`);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const key = `${p.x + dx},${p.z + dz}`;
        if (!remaining.has(key)) continue;
        queue.push(remaining.get(key));
        remaining.delete(key);
      }
    }
    result.push(queue);
  }
  return result;
}
test('version 3 has separated summits and small dispersed hills across 101 seeds', () => {
  for (const seed of [42173, ...Array.from({ length: 100 }, (_, i) => i * 193 + 1)]) {
    const state = g.createGame(0, seed, 3);
    assert.equal(state.terrainVersion, 3);
    const peaks = components(
      state.naturalResources.filter((r) => r.kind === 'stone' && r.amount >= 3),
    );
    const hills = components(state.naturalResources.filter((r) => r.kind === 'soil'));
    assert.ok(peaks.length >= 3, `${seed}: separate upper summits instead of one broad pyramid`);
    assert.ok(hills.length >= 4, `${seed}: dispersed earth hills`);
    assert.ok(
      Math.max(...hills.map((h) => h.length)) <= 40,
      `${seed}: no giant continuous soil slab`,
    );
    assert.ok(state.naturalResources.every((r) => r.amount >= 1 && r.amount <= 4));
    assert.equal(g.terrainAt(20, 19, seed, 3).biome, 'mountain');
    assert.equal(state.trees.length, 64);
    assert.deepEqual(g.importSave(g.exportSave(state), 0), state);
  }
});
test('new demo and read-only title use version 4 while stored version 2 is never upgraded', () => {
  assert.equal(g.createDemoGame(100000).terrainVersion, 4);
  assert.equal(titleIsland().terrainVersion, 4);
  const serialized = JSON.stringify(historical);
  for (let i = 0; i < 3; i++) {
    const restored = g.importSave(serialized, 0);
    assert.deepEqual(
      restored,
      expectedSchema10(historical),
      'old resources, depletion, buildings and trees are exact',
    );
    assert.equal(restored.terrainVersion, 2);
  }
  assert.equal(JSON.stringify(historical), serialized);
  const freshOld = g.createGame(0, historical.mapSeed, 2);
  assert.equal(freshOld.terrainVersion, 2);
  assert.equal(freshOld.naturalResources.length - historical.naturalResources.length, 3);
  const replayOld = g.createGame(0, historical.mapSeed, 2);
  replayOld.trees.splice(0, 4);
  replayOld.naturalResources.splice(0, 3);
  replayOld.naturalResources.find((r) => r.kind === 'stone' && r.amount > 1).amount--;
  assert.deepEqual(
    replayOld,
    expectedSchema10(historical),
    'version 2 generation still matches the pre-v3 fixture',
  );
  assert.notDeepEqual(
    freshOld.naturalResources,
    g.createGame(0, historical.mapSeed, 3).naturalResources,
  );
  for (let z = 0; z < 40; z++)
    for (let x = 0; x < 40; x++)
      assert.equal(
        g.isLandCell(x, z, historical.mapSeed, 2),
        g.isLandCell(x, z, historical.mapSeed, 3),
      );
});
test('mining version 2 and 3 changes only saved stock, never the seed or other columns', () => {
  for (const version of [2, 3]) {
    const state = g.createGame(0, 42173, version);
    const column = state.naturalResources.find((r) => r.kind === 'stone' && r.amount > 1);
    const before = JSON.stringify(state),
      result = g.dispatch(state, { type: 'gatherNatural', resourceId: column.id }, 0);
    assert.ok(result.ok, result.error);
    assert.equal(JSON.stringify(state), before);
    assert.equal(result.state.inventory.stone, state.inventory.stone);
    assert.equal(looseAmount(result.state, 'stone'), looseAmount(state, 'stone') + 1);
    assert.equal(
      result.state.naturalResources.find((r) => r.id === column.id).amount,
      column.amount - 1,
    );
    assert.deepEqual(
      result.state.naturalResources.filter((r) => r.id !== column.id),
      state.naturalResources.filter((r) => r.id !== column.id),
    );
    assert.deepEqual(result.state.trees, state.trees);
    assert.equal(result.state.terrainVersion, version);
    assert.deepEqual(g.importSave(g.exportSave(result.state), 0), result.state);
  }
});
