const { test } = require('node:test');
const assert = require('node:assert/strict');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
const { withLegacyBuilding } = require('./helpers/legacy-town.cjs');
const { createGame, dispatch, exportSave, importSave } = require('../.domain-build/domain/game.js');
function run(s, c) {
  const r = dispatch(s, c, s.lastSeenAt);
  assert.equal(r.ok, true, r.error);
  return r.state;
}
function fail(s, c) {
  const text = JSON.stringify(s),
    r = dispatch(s, c, s.lastSeenAt);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), text);
}
test('moving planted farm preserves all nine jobs, currency and identity', () => {
  let s = {
    ...createGame(0, 1, 1),
    inventory: {
      ...emptyStock(),
      vegetable: 9,
      chilledVegetable: 0,
      wheat: 0,
      lettuce: 0,
      wood: 0,
      stone: 0,
      soil: 0,
      mud: 0,
      treeSeed: 0,
    },
  };
  for (let cell = 0; cell < 9; cell++) s = run(s, { type: 'plantCell', buildingId: 'b2', cell });
  const original = JSON.parse(JSON.stringify(s));
  s = run(s, { type: 'moveBuilding', buildingId: 'b2', x: 2, z: 5 });
  assert.deepEqual(s.buildings[1], { ...original.buildings[1], x: 2, z: 5 });
  assert.equal(s.coins, original.coins);
  assert.equal(s.nextId, original.nextId);
  assert.deepEqual(s.inventory, original.inventory);
  assert.deepEqual(importSave(exportSave(s), 0), s);
});
test('invalid move rejects without modifying position, tasks or resources', () => {
  const s = run(createGame(0, 1, 1), { type: 'plantCell', buildingId: 'b2', cell: 4 });
  for (const [x, z] of [
    [3, 3],
    [24, 24],
    [-1, 0],
    [1.5, 0],
    [NaN, 0],
    [Infinity, 0],
  ])
    fail(s, { type: 'moveBuilding', buildingId: 'b2', x, z });
  fail(s, { type: 'moveBuilding', buildingId: 'missing', x: 2, z: 5 });
});
test('moving dock preserves staged and in-transit cargo and receipts', () => {
  let s = withLegacyBuilding(createGame(0, 1, 1), { kind: 'dock', x: 2, z: 7 });
  s = run(s, {
    type: 'dockTransfer',
    buildingId: 'b3',
    item: 'vegetable',
    quantity: 1,
    direction: 'stage',
  });
  s = run(s, { type: 'dockShip', buildingId: 'b3', shipmentId: 1 });
  const old = JSON.parse(JSON.stringify(s.commerce));
  s = run(s, { type: 'moveBuilding', buildingId: 'b3', x: 15, z: 17 });
  assert.deepEqual(s.commerce, old);
  assert.deepEqual(importSave(exportSave(s), 0), s);
});
