const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looseAmount } = require('./helpers/loose-output.cjs');
const { withLegacyBuilding, withLegacyBuildingAtFreeCell } = require('./helpers/legacy-town.cjs');
const { validatePlacement } = require('../.domain-build/domain/geometry.js');
const {
  worldSize,
  createGame,
  dispatch,
  importSave,
  exportSave,
  isLandCell,
  landCellCount,
  isDockShore,
} = require('../.domain-build/domain/game.js');
function run(s, c, t = s.lastSeenAt) {
  const before = JSON.stringify(s),
    r = dispatch(s, c, t);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), before);
  return r.state;
}
function fail(s, c, t = s.lastSeenAt) {
  const before = JSON.stringify(s),
    r = dispatch(s, c, t);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
}
test('nine-cell harvest leaves saved durability intact, failed attempts cost nothing', () => {
  let s = withLegacyBuildingAtFreeCell(createGame(0, 1, 3), 'warehouse');
  s.inventory.vegetable = 9;
  for (let cell = 0; cell < 9; cell++) s = run(s, { type: 'plantCell', buildingId: 'b2', cell });
  fail(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 14999);
  assert.equal(s.tools.sickle, 90);
  for (let cell = 0; cell < 9; cell++)
    s = run(s, { type: 'harvestCell', buildingId: 'b2', cell }, 15000);
  assert.equal(s.tools.sickle, 90);
  assert.equal(s.inventory.vegetable, 0);
  assert.equal(looseAmount(s, 'vegetable'), 18);
  assert.deepEqual(importSave(exportSave(s), 15000), s);
  fail(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 });
});
test('current save preserves exhausted tools, current seed and resource depletion on every reload', () => {
  let s = createGame(0, 1, 3);
  s.tools.sickle = 0;
  s.trees = [];
  const text = exportSave(s);
  for (let i = 0; i < 5; i++) {
    s = importSave(text, 1000);
    assert.equal(s.tools.sickle, 0);
    assert.equal(s.trees.length, 0);
    assert.equal(s.mapSeed, 1);
  }
  const old = { ...s, schemaVersion: 7 };
  assert.throws(() => importSave(JSON.stringify(old), 1000));
});
// Exhaustive historical-grid coverage; large-world bounds and topology are in terrain-v4.test.cjs.
test('historical natural seed mask is deterministic and varying, with real water and connected starter land', () => {
  const masks = [];
  for (const seed of [100, 42173, 6279]) {
    const s = createGame(0, seed, 3),
      cells = [];
    for (let z = 0; z < worldSize(3); z++)
      for (let x = 0; x < worldSize(3); x++) if (isLandCell(x, z, seed, 3)) cells.push(`${x},${z}`);
    assert.equal(cells.length, landCellCount(seed, 3));
    assert.ok(cells.length > 700 && cells.length < 1200);
    assert.equal(isLandCell(0, 0, seed, 3), false);
    assert.equal(isLandCell(worldSize(3) - 1, worldSize(3) - 1, seed, 3), false);
    assert.deepEqual(createGame(0, seed, 3), s);
    assert.deepEqual(importSave(exportSave(s), 0), s);
    masks.push(cells.join('|'));
  }
  assert.equal(new Set(masks).size, 3);
});
test('existing building footprints obey saved natural mask and accepted saves roundtrip', () => {
  const s = createGame(0, 42173, 3);
  let accepted = 0;
  for (let z = 0; z < worldSize(3); z++)
    for (let x = 0; x < worldSize(3); x++) {
      const building = { id: `b${s.nextId}`, kind: 'warehouse', x, z, rotation: 0 };
      let valid = true;
      try {
        validatePlacement(s, building);
      } catch {
        valid = false;
      }
      const land = [0, 1].every((dx) =>
        [0, 1].every((dz) => isLandCell(x + dx, z + dz, s.mapSeed, s.terrainVersion)),
      );
      if (!land) assert.equal(valid, false);
      if (valid) {
        accepted++;
        assert.ok(land);
        const existing = withLegacyBuilding(s, building);
        assert.deepEqual(importSave(exportSave(existing), 0), existing);
      }
    }
  assert.ok(accepted > 10);
  fail(s, { type: 'dropProduct', item: 'vegetable', x: 0, z: 0 });
  fail(s, { type: 'placeTree', x: 0, z: 0 });
});
test('every generated tree is a real axe target and never respawns from a current save', () => {
  let s = withLegacyBuildingAtFreeCell(createGame(0, 1, 3), 'warehouse');
  s.tools.axe = 0; // Already exhausted saves remain usable without buying or refilling.
  const count = s.trees.length;
  assert.equal(count, 64);
  // Build a sufficiently large historical storage fixture for the complete forest yield.
  s.coins = 1000;
  for (let i = 0; i < 15; i++) s = withLegacyBuildingAtFreeCell(s, 'warehouse');
  for (const tree of [...s.trees]) {
    assert.ok(isLandCell(tree.x, tree.z, s.mapSeed, s.terrainVersion));
    s = run(s, { type: 'useTool', tool: 'axe', treeId: tree.id });
  }
  assert.equal(s.inventory.wood, count * 2);
  assert.equal(s.inventory.treeSeed, count * 2);
  assert.equal(s.trees.length, 0);
  assert.equal(s.tools.axe, 0);
  assert.deepEqual(importSave(exportSave(s), 0), s);
});
test('dock candidates use real water directly beyond the entire south-facing edge', () => {
  for (const seed of [1, 42173, 6279]) {
    let count = 0;
    for (let z = 0; z < worldSize(3); z++)
      for (let x = 0; x < worldSize(3); x++)
        if (isDockShore({ kind: 'dock', x, z, rotation: 0 }, seed, 3)) {
          count++;
          for (let dx = 0; dx < 2; dx++) {
            assert.ok(isLandCell(x + dx, z, seed, 3));
            assert.ok(isLandCell(x + dx, z + 1, seed, 3));
            assert.equal(isLandCell(x + dx, z + 2, seed, 3), false);
          }
        }
    assert.ok(count > 0);
  }
});
