const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock, initializeFacility } = require('../.domain-build/domain/commerce');
function town(simple = true) {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = emptyStock();
  s.buildings = [
    { id: 'b1', kind: 'warehouse', x: 8, z: 5, rotation: 0 },
    { id: 'b3', kind: 'dock', x: 2, z: 2, rotation: 2, ...(simple ? { dockStyle: 'simple' } : {}) },
  ];
  s.nextId = 4;
  initializeFacility(s.commerce, s.buildings[1]);
  return s;
}
function reject(s, command) {
  const before = JSON.stringify(s),
    result = g.dispatch(s, command, 1000);
  assert.equal(result.ok, false);
  assert.equal(result.state, s);
  assert.equal(JSON.stringify(s), before);
}
test('simple dock movement keeps two real in-bounds sea rows while legacy shoreline rules remain unchanged', () => {
  const s = town();
  const target = { ...s.buildings[1], x: 4, z: 1, rotation: 2 };
  assert.equal(g.isDockShore(target, 1, 1), true);
  assert.equal(g.hasDockExit(s, target), false);
  reject(s, { type: 'moveBuilding', buildingId: 'b3', x: 4, z: 1 });
  const old = town(false),
    moved = g.dispatch(old, { type: 'moveBuilding', buildingId: 'b3', x: 4, z: 1 }, 1000);
  assert.equal(moved.ok, true, moved.error);
  assert.equal(moved.state.buildings[1].x, 4);
});
test('safe simple dock movement retains identity, cargo and independent shipping snapshots', () => {
  const s = town();
  s.commerce.dockCargo.b3.flour = 2;
  const r = g.dispatch(s, { type: 'moveBuilding', buildingId: 'b3', x: 8, z: 2 }, 1000);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.state.buildings[1].id, 'b3');
  assert.ok(g.hasDockExit(r.state, r.state.buildings[1]));
  assert.deepEqual(r.state.commerce, s.commerce);
  assert.deepEqual(g.importSave(g.exportSave(r.state), 1000), r.state);
});
test('an imported shallow simple dock keeps its cargo but cannot launch or rotate into a false outlet', () => {
  const raw = town();
  Object.assign(raw.buildings[1], { x: 4, z: 1, rotation: 2 });
  raw.commerce.dockCargo.b3.rice = 2;
  const s = g.importSave(JSON.stringify(raw), 1000);
  assert.equal(s.commerce.dockCargo.b3.rice, 2);
  reject(s, { type: 'dockShip', buildingId: 'b3', shipmentId: 1 });
  reject(s, { type: 'rotateBuilding', buildingId: 'b3' });
  const returned = g.dispatch(
    s,
    { type: 'dockTransfer', buildingId: 'b3', item: 'rice', quantity: 2, direction: 'return' },
    1000,
  );
  assert.equal(returned.ok, true, returned.error);
  assert.equal(returned.state.inventory.rice, 2);
});
