const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { getV5World } = require('../.domain-build/domain/v5-world');
const { getV5Hydrology } = require('../.domain-build/domain/v5-hydrology');
const { looseAmount } = require('./helpers/loose-output.cjs');
const seeds = [1, 17, 1937, 42173, 999999937, 1000000000];
for (const seed of seeds)
  test(`v5 explicit new island ${seed}: real four terrains, IDs, safe saved depletion`, () => {
    const state = g.createGame(0, seed, 5),
      world = getV5World(seed),
      hydro = getV5Hydrology(seed);
    assert.equal(state.terrainVersion, 5);
    assert.equal(state.schemaVersion, 10);
    assert.equal(g.worldSize(5), 192);
    assert.ok(state.naturalResources.length > 7500);
    assert.ok(state.trees.length > 1500);
    const counts = { plain: 0, forest: 0, mountain: 0, hill: 0 };
    for (let z = 0; z < 192; z++)
      for (let x = 0; x < 192; x++) {
        const c = world.at(x, z);
        if (c) counts[c.biome]++;
      }
    assert.ok(
      counts.mountain > 4000 && counts.hill > 3000 && counts.forest > 3000 && counts.plain > 11000,
    );
    assert.ok(Math.max(...state.naturalResources.map((r) => r.amount)) >= 38);
    const ids = new Set();
    for (const r of state.naturalResources) {
      assert.equal(r.id, `n${r.x}_${r.z}`);
      assert.ok(!ids.has(r.id));
      ids.add(r.id);
      assert.equal(hydro.at(r.x, r.z).state, 'dryBuildable');
      assert.equal(r.amount, world.recipe.initialStock(r.x, r.z));
      assert.equal(g.terrainAt(r.x, r.z, seed, 5).elevation, r.amount);
    }
    for (const t of state.trees) {
      assert.match(t.id, /^t[1-9][0-9]*$/);
      assert.ok(!ids.has(t.id));
      ids.add(t.id);
      assert.equal(hydro.at(t.x, t.z).state, 'dryBuildable');
    }
    assert.deepEqual(g.importSave(g.exportSave(state), 0), state);
    const target = state.naturalResources.find((r) => r.amount >= 38),
      before = g.exportSave(state);
    const next = g.dispatch(state, { type: 'gatherNatural', resourceId: target.id }, 0);
    assert.ok(next.ok, next.error);
    assert.equal(g.exportSave(state), before);
    assert.equal(
      next.state.naturalResources.find((r) => r.id === target.id).amount,
      target.amount - 1,
    );
    assert.equal(looseAmount(next.state, 'stone'), looseAmount(state, 'stone') + 1);
    assert.deepEqual(g.importSave(g.exportSave(next.state), 0), next.state);
    const depleted = {
      ...state,
      naturalResources: state.naturalResources.filter((r) => r.id !== target.id),
      trees: state.trees.slice(1),
    };
    assert.deepEqual(g.importSave(g.exportSave(depleted), 0), depleted);
    for (const invalid of [65, target.amount + 1]) {
      const bad = JSON.parse(before);
      bad.naturalResources.find((r) => r.id === target.id).amount = invalid;
      assert.throws(() => g.importSave(JSON.stringify(bad), 0));
    }
    const missing = JSON.parse(before);
    delete missing.naturalResources;
    assert.throws(() => g.importSave(JSON.stringify(missing), 0));
    for (const p of [
      { x: 3, z: 3 },
      { x: 6, z: 3 },
      { x: 8, z: 5 },
    ])
      assert.ok(g.isLandCell(p.x, p.z, seed, 5));
  });
test('v5 is opt-in during integration; default worlds and unknown version validation remain stable', () => {
  assert.equal(g.createGame(0, 42173).terrainVersion, 4);
  assert.throws(() => g.createGame(0, 42173, 6));
  const s = g.createGame(0, 42173, 5);
  s.terrainVersion = 6;
  assert.throws(() => g.importSave(JSON.stringify(s), 0));
});

test('v5 starter pockets have unobstructed dry walking access without erasing the four mainland areas', () => {
  const { buildingOccupiedCells } = require('../.domain-build/domain/building-cells');
  for (const seed of seeds) {
    const state = g.createGame(0, seed, 5),
      hydro = getV5Hydrology(seed),
      key = (x, z) => `${x},${z}`;
    const occupied = new Set(
      [
        ...state.trees,
        ...state.naturalResources,
        ...state.buildings.flatMap(buildingOccupiedCells),
      ].map((p) => key(p.x, p.z)),
    );
    const queue = [{ x: 5, z: 8 }],
      dist = new Map([['5,8', 0]]);
    assert.ok(!occupied.has('5,8'));
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i],
        d = dist.get(key(p.x, p.z));
      if (d >= 28) continue;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = p.x + dx,
          z = p.z + dz,
          k = key(x, z);
        if (occupied.has(k) || dist.has(k) || hydro.at(x, z)?.state !== 'dryBuildable') continue;
        dist.set(k, d + 1);
        queue.push({ x, z });
      }
    }
    for (const [kind, arr] of [
      ['wood', state.trees],
      ['soil', state.naturalResources.filter((r) => r.kind === 'soil')],
      ['stone', state.naturalResources.filter((r) => r.kind === 'stone')],
    ]) {
      const best = Math.min(
        ...arr.flatMap((p) =>
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].map(([dx, dz]) => dist.get(key(p.x + dx, p.z + dz)) ?? Infinity),
        ),
      );
      assert.ok(best <= 28, `${seed} ${kind}: ${best} steps`);
    }
    assert.equal(state.trees.filter((t) => t.x < 36 && t.z < 36).length, 18);
    for (const b of state.buildings)
      for (const p of buildingOccupiedCells(b))
        assert.ok(
          ![...state.trees, ...state.naturalResources].some(
            (r) => Math.max(Math.abs(r.x - p.x), Math.abs(r.z - p.z)) <= 1,
          ),
        );
  }
});
test('v5 pure starter candidates cover one hundred deterministic seeds without world creation recursion', () => {
  const { createV5Starter } = require('../.domain-build/domain/v5-starter');
  for (let i = 1; i <= 100; i++) {
    const seed = ((Math.imul(i, 104729) >>> 0) % 1000000000) + 1;
    const starter = createV5Starter(seed, getV5Hydrology(seed));
    assert.equal(starter.treeCandidates.length, 18);
    assert.equal(starter.pockets.length, 2);
  }
});
