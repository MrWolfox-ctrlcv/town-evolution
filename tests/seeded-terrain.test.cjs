const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looseAmount, pickupDrops } = require('./helpers/loose-output.cjs');
const g = require('../.domain-build/domain/game');
const { legacyLandCell } = require('../.domain-build/domain/island');
const { validatePlacement } = require('../.domain-build/domain/geometry');
const { initializeFacility } = require('../.domain-build/domain/commerce');
const seeds = [1, 100, 6279, 42173, 193073, 999999999];
function apply(state, command) {
  const before = JSON.stringify(state);
  const result = g.dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, true, result.error);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(g.importSave(g.exportSave(result.state), state.lastSeenAt), result.state);
  return result.state;
}
function soil(state) {
  return state.naturalResources.find((r) => r.kind === 'soil');
}

test('historical 40-cell islands reproduce seed, have central mountains and all four biomes', () => {
  assert.equal(g.worldSize(3), 40);
  const layouts = new Set();
  for (const seed of seeds) {
    const state = g.createGame(0, seed, 3);
    assert.equal(state.terrainVersion, 3);
    assert.deepEqual(g.createGame(0, seed, 3), state);
    const counts = {},
      layout = [];
    for (let z = 0; z < 40; z++)
      for (let x = 0; x < 40; x++) {
        const cell = g.terrainAt(x, z, seed, 3);
        if (!cell) continue;
        counts[cell.biome] = (counts[cell.biome] || 0) + 1;
        layout.push(`${x},${z}:${cell.biome}:${cell.elevation}`);
        if (cell.biome === 'mountain') assert.ok(Math.hypot(x - 20, z - 19) < 11);
      }
    assert.deepEqual(Object.keys(counts).sort(), ['forest', 'hill', 'mountain', 'plain']);
    assert.ok(g.landCellCount(seed, 3) > 700);
    assert.equal(g.terrainAt(20, 19, seed, 3).biome, 'mountain');
    layouts.add(layout.join('|'));
    assert.deepEqual(g.importSave(g.exportSave(state), 0), state);
  }
  assert.equal(layouts.size, seeds.length);
});

test('forests and soil hills are noise-distributed on every side rather than fixed compass sectors', () => {
  const quadrants = { forest: new Set(), hill: new Set() };
  for (const seed of seeds)
    for (let z = 1; z < 39; z++)
      for (let x = 1; x < 39; x++) {
        const cell = g.terrainAt(x, z, seed);
        if (cell && quadrants[cell.biome]) quadrants[cell.biome].add(`${x < 20}:${z < 19}`);
      }
  assert.equal(quadrants.forest.size, 4);
  assert.equal(quadrants.hill.size, 4);
});

test('starter buildings remain on clear coastal plains and all legal land is connected', () => {
  for (const seed of seeds) {
    const state = g.createGame(0, seed),
      start = state.buildings[0];
    let distanceToSea = Infinity;
    for (let z = 0; z < 40; z++)
      for (let x = 0; x < 40; x++)
        if (!g.isLandCell(x, z, seed))
          distanceToSea = Math.min(distanceToSea, Math.abs(start.x - x) + Math.abs(start.z - z));
    assert.ok(distanceToSea <= 3, `starter shoreline ${seed}: ${distanceToSea}`);
    for (const b of state.buildings) {
      validatePlacement(state, b);
      assert.equal(g.terrainAt(b.x, b.z, seed).biome, 'plain');
    }
    const queue = [[start.x, start.z]],
      visited = new Set([`${start.x},${start.z}`]);
    for (let i = 0; i < queue.length; i++) {
      const [x, z] = queue[i];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          nz = z + dz,
          key = `${nx},${nz}`;
        if (!visited.has(key) && g.isLandCell(nx, nz, seed)) {
          visited.add(key);
          queue.push([nx, nz]);
        }
      }
    }
    assert.equal(visited.size, g.landCellCount(seed));
  }
});

test('new natural deposits and woodland trees are real nonoverlapping saved occupants', () => {
  for (const seed of seeds) {
    const state = g.createGame(0, seed),
      cells = new Set();
    assert.equal(state.trees.length, 192);
    assert.ok(state.naturalResources.some((r) => r.kind === 'stone'));
    assert.ok(soil(state));
    for (const r of state.naturalResources) {
      const t = g.terrainAt(r.x, r.z, seed);
      assert.equal(t.biome, r.kind === 'stone' ? 'mountain' : 'hill');
      assert.equal(r.amount, t.elevation);
      assert.equal(r.id, `n${r.x}_${r.z}`);
      assert.ok(!cells.has(`${r.x},${r.z}`));
      cells.add(`${r.x},${r.z}`);
      assert.throws(() =>
        validatePlacement(state, {
          id: 'candidate',
          kind: 'orderBoard',
          x: r.x,
          z: r.z,
          rotation: 0,
        }),
      );
    }
    let woodlandTrees = 0;
    for (const t of state.trees) {
      assert.ok(!cells.has(`${t.x},${t.z}`));
      cells.add(`${t.x},${t.z}`);
      if (g.terrainAt(t.x, t.z, seed).biome === 'forest') woodlandTrees++;
    }
    assert.ok(woodlandTrees / state.trees.length > 0.75);
  }
});

test('digging consumes an entire soil mound once for nine soil and keeps tool saves unchanged', () => {
  let state = g.createGame(0, 42173),
    resource = soil(state);
  const count = state.naturalResources.length,
    tools = { ...state.tools };
  state = apply(state, { type: 'gatherNatural', resourceId: resource.id });
  assert.equal(state.inventory.soil, 0);
  assert.equal(looseAmount(state, 'soil'), 9);
  assert.deepEqual(
    state.looseDrops.map((drop) => drop.amount),
    [5, 4],
  );
  assert.equal(state.naturalResources.length, count - 1);
  assert.equal(
    state.naturalResources.some((r) => r.id === resource.id),
    false,
  );
  assert.deepEqual(state.tools, tools);
  for (let i = 0; i < 3; i++) state = g.importSave(g.exportSave(state), 0);
  const again = g.dispatch(state, { type: 'gatherNatural', resourceId: resource.id }, 0);
  assert.equal(again.ok, false);
  assert.equal(again.state, state);
  assert.throws(() =>
    validatePlacement(state, {
      id: 'candidate',
      kind: 'orderBoard',
      x: resource.x,
      z: resource.z,
      rotation: 0,
    }),
  );
  state = pickupDrops(state);
  assert.equal(state.inventory.soil, 9);
  validatePlacement(state, {
    id: 'candidate',
    kind: 'orderBoard',
    x: resource.x,
    z: resource.z,
    rotation: 0,
  });
  state = apply(state, {
    type: 'dropProduct',
    item: 'soil',
    quantity: 5,
    x: resource.x,
    z: resource.z,
  });
  assert.equal(state.inventory.soil, 4);
  state = apply(state, { type: 'pickupStack', x: resource.x, z: resource.z });
  assert.equal(state.inventory.soil, 9);
});

test('full storage does not block digging, but pickup and missing deposits reject atomically', () => {
  for (const kind of ['soil', 'stone']) {
    const state = g.createGame(0, 42173);
    const resource = state.naturalResources.find((entry) => entry.kind === kind);
    state.inventory.vegetable = 16;
    const next = apply(state, { type: 'gatherNatural', resourceId: resource.id });
    assert.deepEqual(next.inventory, state.inventory);
    assert.equal(looseAmount(next, kind), kind === 'soil' ? 9 : 1);
    for (const command of [
      { type: 'pickupDrop', dropId: next.looseDrops[0].id },
      { type: 'gatherNatural', resourceId: 'missing' },
    ]) {
      const before = JSON.stringify(next),
        result = g.dispatch(next, command, 0);
      assert.equal(result.ok, false);
      assert.equal(result.state, next);
      assert.equal(JSON.stringify(next), before);
    }
  }
});

test('legacy v8 imports retain exact coastline, depleted trees and old docks without adding deposits', () => {
  const legacy = g.createGame(0, 42173, 1);
  legacy.trees = [];
  let dock;
  for (let z = 0; z < 24 && !dock; z++)
    for (let x = 0; x < 24 && !dock; x++) {
      const candidate = { id: 'b3', kind: 'dock', x, z, rotation: 0 };
      try {
        validatePlacement(legacy, candidate);
        if (g.isDockShore(candidate, legacy.mapSeed, 1)) dock = candidate;
      } catch {}
    }
  assert.ok(dock);
  legacy.buildings.push(dock);
  legacy.nextId = 4;
  initializeFacility(legacy.commerce, dock);
  legacy.schemaVersion = 8;
  for (const stock of [legacy.inventory, ...Object.values(legacy.commerce.dockCargo)])
    for (const item of ['rice', 'sapling', 'milledRice', 'flour', 'bread']) delete stock[item];
  delete legacy.terrainVersion;
  delete legacy.naturalResources;
  delete legacy.inventory.soil;
  delete legacy.inventory.treeSeed;
  delete legacy.tools.diggingTool;
  delete legacy.toolRecoveryAvailable.diggingTool;
  for (const stock of Object.values(legacy.commerce.dockCargo)) {
    delete stock.soil;
    delete stock.treeSeed;
  }
  const text = JSON.stringify(legacy),
    loaded = g.importSave(text, 0);
  assert.equal(JSON.stringify(legacy), text);
  assert.equal(loaded.terrainVersion, 1);
  assert.deepEqual(loaded.trees, []);
  assert.deepEqual(loaded.naturalResources, []);
  assert.equal(loaded.inventory.soil, 0);
  assert.equal(loaded.inventory.treeSeed, 0);
  assert.ok(g.isDockShore(dock, loaded.mapSeed, loaded.terrainVersion));
  for (let z = 0; z < 40; z++)
    for (let x = 0; x < 40; x++)
      assert.equal(
        g.isLandCell(x, z, loaded.mapSeed, loaded.terrainVersion),
        legacyLandCell(x, z, loaded.mapSeed),
      );
  apply(loaded, { type: 'moveBuilding', buildingId: dock.id, x: dock.x, z: dock.z });
});

test('malformed terrain versions, resource cells and values never get silently repaired', () => {
  for (const mutate of [
    (s) => (s.terrainVersion = 5),
    (s) => (s.terrainVersion = null),
    (s) => (s.naturalResources = null),
    (s) => (s.naturalResources[0].amount = 0),
    (s) => (s.naturalResources[0].amount = 5),
    (s) => (s.naturalResources[0].amount = 1.5),
    (s) => (s.naturalResources[0].id = 'wrong'),
    (s) => (s.naturalResources[0].x = 0),
    (s) => s.naturalResources.push({ ...s.naturalResources[0] }),
    (s) => (s.inventory.soil = -1),
    (s) => (s.tools.diggingTool = 'Infinity'),
  ]) {
    const state = g.createGame(0, 42173);
    mutate(state);
    const text = JSON.stringify(state);
    assert.throws(() => g.importSave(text, 0));
    assert.equal(JSON.stringify(state), text);
  }
});

test('the digging tool mines one rock cube at a time and depletion survives reload', () => {
  let state = g.createGame(0, 42173);
  const resource = state.naturalResources.find((r) => r.kind === 'stone' && r.amount > 1);
  assert.ok(resource);
  const amount = resource.amount;
  for (let i = 0; i < amount; i++)
    state = apply(state, { type: 'gatherNatural', resourceId: resource.id });
  assert.equal(state.inventory.stone, 0);
  assert.equal(looseAmount(state, 'stone'), amount);
  assert.deepEqual(g.importSave(g.exportSave(state), 0), state);
  assert.equal(
    state.naturalResources.some((r) => r.id === resource.id),
    false,
  );
});
