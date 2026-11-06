const test = require('node:test');
const assert = require('node:assert/strict');
const { looseAmount } = require('./helpers/loose-output.cjs');
const { expectedSchema10 } = require('./helpers/expected-schema10.cjs');
const g = require('../.domain-build/domain/game');
const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
const historical = require('./fixtures/terrain-v2-depleted.json');

test('v4 grows actual connected island land by at least twenty times without scaling resource density', () => {
  assert.equal(g.CONFIG.gridSize, 192);
  for (const seed of [1, 17, 1937, 42173, 1000000000]) {
    const state = g.createGame(0, seed),
      size = g.worldSize(state.terrainVersion);
    assert.equal(state.terrainVersion, 4);
    assert.ok(g.landCellCount(seed, 4) >= g.landCellCount(seed, 3) * 20);
    assert.ok(
      state.naturalResources.length < 1800,
      'terrain uses sparse ranges, not 20x mesh columns',
    );
    assert.ok(Math.max(...state.naturalResources.map((r) => r.amount)) >= 12);
    assert.equal(state.trees.length, 192);
    assert.ok(g.exportSave(state).length < 200000);
    const queue = [[3, 3]],
      seen = new Set(['3,3']);
    for (let i = 0; i < queue.length; i++) {
      const [x, z] = queue[i];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = x + dx,
          b = z + dz,
          key = `${a},${b}`;
        if (g.isLandCell(a, b, seed, 4) && !seen.has(key)) {
          seen.add(key);
          queue.push([a, b]);
        }
      }
    }
    assert.equal(seen.size, g.landCellCount(seed, 4), 'starter peninsula joins the whole island');
    for (let i = 0; i < size; i++) {
      assert.equal(g.isLandCell(0, i, seed, 4), false);
      assert.equal(g.isLandCell(size - 1, i, seed, 4), false);
      assert.equal(g.isLandCell(i, 0, seed, 4), false);
      assert.equal(g.isLandCell(i, size - 1, seed, 4), false);
    }
  }
});

test('v1-v3 keep exact world bounds and historical depletion, identities and inventory', () => {
  assert.deepEqual(g.importSave(JSON.stringify(historical), 0), expectedSchema10(historical));
  for (const version of [1, 2, 3]) {
    const state = g.createGame(0, 42173, version),
      saved = g.exportSave(state);
    assert.equal(g.worldSize(version), 40);
    assert.equal(g.isLandCell(90, 90, state.mapSeed, version), false);
    assert.deepEqual(g.importSave(saved, 0), state);
    const altered = { ...state, landExtensions: [{ x: 90, z: 90 }] };
    assert.throws(() => g.importSave(JSON.stringify(altered), 0));
  }
});

test('v4 tall mountain mining remains one stone per command and round-trips without regeneration', () => {
  const original = g.createGame(0, 42173),
    target = original.naturalResources.find((r) => r.amount >= 14);
  const old = g.exportSave(original);
  const next = g.dispatch(original, { type: 'gatherNatural', resourceId: target.id }, 0);
  assert.ok(next.ok, next.error);
  assert.equal(g.exportSave(original), old);
  assert.equal(next.state.inventory.stone, original.inventory.stone);
  assert.equal(looseAmount(next.state, 'stone'), looseAmount(original, 'stone') + 1);
  assert.equal(
    next.state.naturalResources.find((r) => r.id === target.id).amount,
    target.amount - 1,
  );
  assert.deepEqual(
    next.state.naturalResources.filter((r) => r.id !== target.id),
    original.naturalResources.filter((r) => r.id !== target.id),
  );
  assert.deepEqual(g.importSave(g.exportSave(next.state), 0), next.state);
  for (const value of [17, -1, 1.5, Infinity]) {
    const bad = JSON.parse(old);
    bad.naturalResources.find((r) => r.id === target.id).amount = value;
    assert.throws(() => g.importSave(JSON.stringify(bad), 0));
  }
});

test('v4 resource geometry stays bounded and a cut rebuilds only its direct neighbors', () => {
  const state = g.createGame(0, 42173),
    view = new ContinuousResources(192, state.mapSeed, (x, z) =>
      g.terrainAt(x, z, state.mapSeed, 4),
    );
  const first = view.sync(state.naturalResources);
  assert.ok(first.mesh.positions.length / 3 < 45000);
  assert.ok(first.mesh.indices.length / 3 < 55000);
  assert.ok(first.mesh.max[1] >= 12);
  for (const resource of state.naturalResources.filter((r) => r.kind === 'stone' && r.amount > 1))
    assert.ok(
      view.field.height(resource.x + 0.5, resource.z + 0.5) > resource.amount - 1 + 0.015,
      `${resource.id}: the first stone must intersect the visible mountain, including sharp summits`,
    );
  const target = state.naturalResources.find((r) => r.amount >= 14);
  const next = g.dispatch(state, { type: 'gatherNatural', resourceId: target.id }, 0);
  const result = view.sync(next.state.naturalResources);
  assert.ok(result.rebuiltCells <= 5);
  assert.equal(result.naturalSurface.positions, result.mesh.positions);
  assert.equal(result.triangleOwners.length * 3, result.mesh.indices.length);
  assert.equal(view.sync(next.state.naturalResources).rebuiltCells, 0);
});

test('expanded save size has an exact bounded parser limit and never overwrites hostile input', () => {
  const { MAX_SAVE_CHARACTERS } = require('../.domain-build/domain/save');
  const { loadGame, SAVE_KEY } = require('../.domain-build/domain/storage');
  assert.equal(MAX_SAVE_CHARACTERS, 4000000);
  const state = g.createGame(0, 17),
    encoded = g.exportSave(state);
  const boundary = encoded + ' '.repeat(MAX_SAVE_CHARACTERS - encoded.length);
  assert.deepEqual(g.importSave(boundary, 0), state);
  assert.throws(() => g.importSave(boundary + ' ', 0), /存档过大/);
  const hostile = '{' + ' '.repeat(MAX_SAVE_CHARACTERS);
  let writes = 0;
  const storage = {
    getItem: (key) => (key === SAVE_KEY ? hostile : null),
    setItem: () => writes++,
    removeItem: () => writes++,
  };
  assert.equal(loadGame(storage, 0).status, 'corrupt');
  assert.equal(storage.getItem(SAVE_KEY), hostile);
  assert.equal(writes, 0, 'failed import must preserve all original storage bytes');
});

test('large and historical saves reject overlong lists before accepting their cells', () => {
  for (const version of [3, 4]) {
    const state = g.createGame(0, 17, version),
      limit = g.worldSize(version) ** 2;
    for (const field of [
      'buildings',
      'trees',
      'groundStacks',
      'naturalResources',
      'landExtensions',
    ]) {
      const value = { ...state, [field]: Array(limit + 1).fill(null) };
      const encoded = JSON.stringify(value);
      assert.throws(() => g.importSave(encoded, 0));
      assert.equal(JSON.stringify(value), encoded);
    }
  }
});

test('reversed large reclamation arrays validate by connectivity without reordering saved cells', () => {
  const { importLandExtensions } = require('../.domain-build/domain/expansion');
  const size = g.worldSize(4),
    cells = [];
  for (let z = 1; z < size - 1; z++)
    for (let x = 1; x < size - 1; x++) if (!g.isLandCell(x, z, 17, 4)) cells.push({ x, z });
  cells.reverse();
  assert.ok(cells.length > 5000);
  assert.deepEqual(importLandExtensions(cells, 17, 4), cells);
  assert.equal(g.landCellCount(17, 4, cells), (size - 2) ** 2);
});
