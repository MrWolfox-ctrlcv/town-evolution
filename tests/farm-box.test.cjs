const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
function town() {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = { ...emptyStock(), vegetable: 1, rice: 1 };
  s.buildings.push({ id: 'b3', kind: 'crate', x: 9, z: 5, rotation: 0 });
  s.nextId = 4;
  return s;
}
function accept(s, c, now = s.lastSeenAt) {
  const text = JSON.stringify(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), text);
  assert.deepEqual(g.importSave(g.exportSave(r.state), r.state.lastSeenAt), r.state);
  return r.state;
}
function reject(s, c, now = s.lastSeenAt) {
  const text = JSON.stringify(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), text);
}
function boxCommand(s) {
  return {
    type: 'hammerAssembly',
    tool: 'hammer',
    sources: s.buildings
      .filter((b) => b.id === 'b2' || b.id === 'b3')
      .map(({ id, kind, x, z, rotation }) => ({ id, kind, x, z, rotation })),
  };
}
test('farm box keeps crate identity, local capacity and manually cut crops, never auto harvests', () => {
  let s = town();
  const cap = g.getCapacity(s);
  s = accept(s, boxCommand(s));
  assert.equal(g.getCapacity(s), cap);
  assert.equal(s.buildings.length, 2);
  assert.equal(s.buildings[1].collectionBox.crateId, 'b3');
  assert.equal(s.buildings[1].collectionBox.capacity, 16);
  s = accept(s, { type: 'plantCell', buildingId: 'b2', cell: 0 });
  s = g.advance(s, 100000);
  assert.ok(s.buildings[1].cropJobs[0]);
  assert.equal(s.buildings[1].collectionBox.stock.vegetable, 0);
  const inventory = { ...s.inventory };
  s = accept(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 });
  assert.deepEqual(s.inventory, inventory);
  assert.equal(s.looseDrops.length, 0);
  assert.equal(s.buildings[1].collectionBox.stock.vegetable, 2);
  s = accept(s, { type: 'withdrawFarmBox', buildingId: 'b2', item: 'vegetable', quantity: 2 });
  assert.equal(s.inventory.vegetable, 2);
  assert.equal(s.buildings[1].collectionBox.stock.vegetable, 0);
});
test('full local box retains ripe job; full town storage retains box goods and no overflow lands', () => {
  let s = town();
  s = accept(s, boxCommand(s));
  s = accept(s, { type: 'plantCell', buildingId: 'b2', cell: 0 });
  s.buildings[1].collectionBox.stock.wheat = 15;
  reject(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 16000);
  assert.equal(s.looseDrops.length, 0);
  s.buildings[1].collectionBox.stock.wheat = 14;
  s = accept(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 16000);
  s.inventory.wood = g.getCapacity(s) - g.getUsedStorage(s);
  reject(s, { type: 'withdrawFarmBox', buildingId: 'b2', item: 'vegetable', quantity: 2 });
  reject(s, { type: 'withdrawFarmBox', buildingId: 'b2', item: 'wood', quantity: 1 });
});
test('box and stock survive move/rotation/offline unchanged; repeated attach and repurpose cannot consume crate', () => {
  let s = town();
  s = accept(s, boxCommand(s));
  s.buildings[1].collectionBox.stock.rice = 4;
  const box = JSON.stringify(s.buildings[1].collectionBox);
  s = accept(s, { type: 'rotateBuilding', buildingId: 'b2' });
  s = accept(s, { type: 'moveBuilding', buildingId: 'b2', x: 10, z: 7 });
  assert.equal(JSON.stringify(s.buildings[1].collectionBox), box);
  reject(s, { type: 'attachFarmBox', buildingId: 'b2', crateId: 'b3' });
  reject(s, { type: 'repurposeToBoard', buildingId: 'b2' });
});
test('outside box reserves exactly one tile and preserves all crop centers in four rotations', () => {
  for (const large of [false, true])
    for (let rotation = 0; rotation < 4; rotation++) {
      let s = town(),
        farm = s.buildings[1];
      farm.rotation = rotation;
      if (large) {
        farm.farmSize = 6;
        farm.cropJobs = Array(36).fill(null);
        Object.assign(s.buildings[2], { x: 12, z: 8 });
      }
      const centers = farm.cropJobs.map((_, i) => g.cropDropAnchor(farm, i));
      s = accept(s, boxCommand(s));
      farm = s.buildings[1];
      const cell = g.farmBoxCell(farm),
        n = large ? 4 : 2;
      assert.equal(g.buildingOccupiedCells(farm).length, n * n + 1);
      assert.ok(g.buildingOccupiesCell(farm, cell.x, cell.z));
      assert.deepEqual(
        farm.cropJobs.map((_, i) => g.cropDropAnchor(farm, i)),
        centers,
      );
      reject(s, { type: 'placeTree', x: cell.x, z: cell.z });
      s.inventory.wood = 1;
      reject(s, { type: 'dropProduct', item: 'wood', x: cell.x, z: cell.z, quantity: 1 });
    }
});
test('blocked box extension rejects assembly and rotation without losing the box or crops', () => {
  let s = town();
  s.groundStacks.push({ x: 8, z: 4, item: 'wood', amount: 1 });
  reject(s, boxCommand(s));
  s.groundStacks = [];
  s = accept(s, boxCommand(s));
  s.buildings[1].collectionBox.stock.wheat = 5;
  s.trees.push({ id: `t${s.nextTreeId++}`, x: 7, z: 2 });
  reject(s, { type: 'rotateBuilding', buildingId: 'b2' });
  const bad = structuredClone(s);
  bad.trees.push({ id: `t${bad.nextTreeId++}`, x: 8, z: 4 });
  assert.throws(() => g.importSave(JSON.stringify(bad), 1000));
});
