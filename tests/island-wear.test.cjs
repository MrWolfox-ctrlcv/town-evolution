const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
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
function addWarehouse(s) {
  for (let z = 0; z < 24; z++)
    for (let x = 0; x < 24; x++) {
      const r = dispatch(s, { type: 'place', kind: 'warehouse', x, z }, s.lastSeenAt);
      if (r.ok) return r.state;
    }
  throw Error('No valid warehouse spot');
}
test('nine-cell harvest costs nine of ninety durability, failed attempts cost nothing', () => {
  let s = addWarehouse(createGame(0));
  s.inventory.vegetable = 9;
  for (let cell = 0; cell < 9; cell++) s = run(s, { type: 'plantCell', buildingId: 'b2', cell });
  fail(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 14999);
  assert.equal(s.tools.sickle, 90);
  for (let cell = 0; cell < 9; cell++)
    s = run(s, { type: 'harvestCell', buildingId: 'b2', cell }, 15000);
  assert.equal(s.tools.sickle, 81);
  assert.equal(s.inventory.vegetable, 18);
  fail(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 });
});
test('current save preserves exhausted tools, current seed and resource depletion on every reload', () => {
  let s = createGame(0);
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
test('natural seed mask is deterministic and varying, with real water and connected starter land', () => {
  const masks = [];
  for (const seed of [100, 42173, 6279]) {
    const s = createGame(0, seed),
      cells = [];
    for (let z = 0; z < 24; z++)
      for (let x = 0; x < 24; x++) if (isLandCell(x, z, seed)) cells.push(`${x},${z}`);
    assert.equal(cells.length, landCellCount(seed));
    assert.ok(cells.length > 150 && cells.length < 400);
    assert.equal(isLandCell(0, 0, seed), false);
    assert.equal(isLandCell(23, 23, seed), false);
    assert.deepEqual(createGame(0, seed), s);
    assert.deepEqual(importSave(exportSave(s), 0), s);
    masks.push(cells.join('|'));
  }
  assert.equal(new Set(masks).size, 3);
});
test('all building footprint cells obey saved natural mask and all accepted saves roundtrip', () => {
  const s = createGame(0, 42173);
  let accepted = 0;
  for (let z = 0; z < 24; z++)
    for (let x = 0; x < 24; x++) {
      const r = dispatch(s, { type: 'place', kind: 'warehouse', x, z }, 0);
      const land = [0, 1].every((dx) =>
        [0, 1].every((dz) => isLandCell(x + dx, z + dz, s.mapSeed)),
      );
      if (!land) assert.equal(r.ok, false);
      if (r.ok) {
        accepted++;
        assert.ok(land);
        assert.deepEqual(importSave(exportSave(r.state), 0), r.state);
      }
    }
  assert.ok(accepted > 10);
  fail(s, { type: 'dropProduct', item: 'vegetable', x: 0, z: 0 });
  fail(s, { type: 'placeTree', x: 0, z: 0 });
});
test('every generated tree is a real axe target and never respawns from a current save', () => {
  let s = addWarehouse(createGame(0));
  s = run(s, { type: 'buyTool', tool: 'axe' });
  s = run(s, { type: 'buyTool', tool: 'axe' });
  const count = s.trees.length;
  assert.equal(count, 24);
  for (const tree of [...s.trees]) {
    assert.ok(isLandCell(tree.x, tree.z, s.mapSeed));
    s = run(s, { type: 'useTool', tool: 'axe', treeId: tree.id });
  }
  assert.equal(s.inventory.wood, count);
  assert.equal(s.trees.length, 0);
  assert.equal(s.tools.axe, 30 - count);
  assert.deepEqual(importSave(exportSave(s), 0), s);
});
test('dock candidates use real water directly beyond the entire south-facing edge', () => {
  for (const seed of [1, 42173, 6279]) {
    let count = 0;
    for (let z = 0; z < 24; z++)
      for (let x = 0; x < 24; x++)
        if (isDockShore({ kind: 'dock', x, z, rotation: 0 }, seed)) {
          count++;
          for (let dx = 0; dx < 2; dx++) {
            assert.ok(isLandCell(x + dx, z, seed));
            assert.ok(isLandCell(x + dx, z + 1, seed));
            assert.equal(isLandCell(x + dx, z + 2, seed), false);
          }
        }
    assert.ok(count > 0);
  }
});
