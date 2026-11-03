const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  dispatch,
  importSave,
  exportSave,
  getUsedStorage,
  CROP_KEYS,
} = require('../.domain-build/domain/game.js');
function run(s, c, t = s.lastSeenAt) {
  const text = JSON.stringify(s),
    r = dispatch(s, c, t);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), text);
  return r.state;
}
function fail(s, c) {
  const text = JSON.stringify(s),
    r = dispatch(s, c, s.lastSeenAt);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), text);
}
test('carrot wheat lettuce use independent inventories and each cell remembers its planted crop', () => {
  let s = createGame(0);
  for (const item of ['wheat', 'lettuce']) s = run(s, { type: 'buyCrop', item, quantity: 1 });
  assert.equal(s.coins, 104);
  assert.equal(getUsedStorage(s), 3);
  for (const [cell, crop] of CROP_KEYS.entries())
    s = run(s, { type: 'plantCell', buildingId: 'b2', cell, crop }, cell * 1000);
  assert.equal(getUsedStorage(s), 0);
  assert.deepEqual(
    s.buildings[1].cropJobs.slice(0, 3).map((j) => j.crop),
    CROP_KEYS,
  );
  s = importSave(exportSave(s), 17000);
  s = run(s, { type: 'harvestCell', buildingId: 'b2', cell: 1 });
  assert.equal(s.inventory.wheat, 2);
  assert.equal(s.inventory.vegetable, 0);
  assert.equal(s.inventory.lettuce, 0);
  s = run(s, { type: 'harvestCell', buildingId: 'b2', cell: 2 });
  s = run(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 });
  assert.deepEqual(s.inventory, {
    vegetable: 2,
    wheat: 2,
    lettuce: 2,
    chilledVegetable: 0,
    wood: 0,
    stone: 0,
  });
  fail(s, { type: 'plantCell', buildingId: 'b2', cell: 3, crop: 'chilledVegetable' });
  fail(s, { type: 'plantCell', buildingId: 'b2', cell: 3, crop: '__proto__' });
});
test('mixed crops count toward capacity and are tracked through bulk, staging, shipping and refunds', () => {
  let s = createGame(0);
  s = run(s, { type: 'place', kind: 'orderBoard', x: 2, z: 5 });
  s = run(s, { type: 'place', kind: 'dock', x: 7, z: 18 });
  s = {
    ...s,
    inventory: { vegetable: 0, wheat: 8, lettuce: 8, chilledVegetable: 0, wood: 0, stone: 0 },
  };
  fail(s, { type: 'buyCrop', item: 'wheat', quantity: 1 });
  s = run(s, { type: 'orderFulfill', buildingId: 'b3', orderId: 'wheat', offerId: 1 });
  assert.equal(s.inventory.wheat, 0);
  assert.equal(s.coins, 126);
  s = run(s, {
    type: 'dockTransfer',
    buildingId: 'b4',
    item: 'lettuce',
    quantity: 8,
    direction: 'stage',
  });
  assert.equal(getUsedStorage(s), 0);
  s = run(s, {
    type: 'dockTransfer',
    buildingId: 'b4',
    item: 'lettuce',
    quantity: 1,
    direction: 'return',
  });
  assert.equal(s.inventory.lettuce, 1);
  s = run(s, { type: 'dockShip', buildingId: 'b4', shipmentId: 1 });
  assert.equal(s.commerce.shipments.b4.cargo.lettuce, 7);
  assert.equal(s.commerce.shipments.b4.reward, 42);
  s = importSave(exportSave(s), 30000);
  s = run(s, { type: 'dockCollect', buildingId: 'b4', shipmentId: 1 });
  assert.equal(s.coins, 168);
});
test('shop can buy and sell each crop without cross-crop resource changes', () => {
  let s = run(createGame(0), { type: 'place', kind: 'shop', x: 2, z: 5 });
  for (const item of CROP_KEYS) {
    const before = { ...s.inventory };
    s = run(s, { type: 'shopTrade', buildingId: 'b3', item, quantity: 1, side: 'buy' });
    assert.equal(s.inventory[item], before[item] + 1);
    s = run(s, { type: 'shopTrade', buildingId: 'b3', item, quantity: 1, side: 'sell' });
    assert.deepEqual(s.inventory, before);
  }
  assert.equal(s.coins, 81);
  assert.deepEqual(importSave(exportSave(s), 0), s);
});
test('current save preserves carrot cell identity and existing cold goods; obsolete schema rejects', () => {
  let source = run(createGame(0), { type: 'plantCell', buildingId: 'b2', cell: 4 });
  source.inventory.chilledVegetable = 2;
  const old = JSON.parse(JSON.stringify(source));
  old.schemaVersion = 4;
  assert.throws(() => importSave(JSON.stringify(old), 15000));
  let s = importSave(exportSave(source), 15000);
  assert.equal(s.schemaVersion, 8);
  assert.equal(s.inventory.vegetable, 0);
  assert.equal(s.inventory.chilledVegetable, 2);
  assert.equal(s.inventory.wheat, 0);
  assert.equal(s.inventory.lettuce, 0);
  assert.equal(s.buildings[1].cropJobs[4].crop, 'vegetable');
  s = run(s, { type: 'harvestCell', buildingId: 'b2', cell: 4 });
  assert.equal(s.inventory.vegetable, 2);
  assert.equal(s.inventory.chilledVegetable, 2);
  assert.deepEqual(importSave(exportSave(s), 15000), s);
});
test('new and moved docks require seeded shoreline and preserve staged cargo', () => {
  const initial = createGame(0);
  for (const [x, z] of [
    [0, 0],
    [0, 5],
    [10, 0],
    [5, 9],
  ])
    fail(initial, { type: 'place', kind: 'dock', x, z });
  let s = run(initial, { type: 'place', kind: 'dock', x: 2, z: 7 });
  s = run(s, {
    type: 'dockTransfer',
    buildingId: 'b3',
    item: 'vegetable',
    quantity: 1,
    direction: 'stage',
  });
  s = importSave(exportSave(s), 0);
  assert.equal(s.commerce.dockCargo.b3.vegetable, 1);
  fail(s, { type: 'moveBuilding', buildingId: 'b3', x: 5, z: 5 });
  s = run(s, { type: 'moveBuilding', buildingId: 'b3', x: 7, z: 18 });
  assert.equal(s.commerce.dockCargo.b3.vegetable, 1);
  s = run(s, { type: 'dockShip', buildingId: 'b3', shipmentId: 1 });
  assert.equal(s.commerce.shipments.b3.reward, 6);
});
test('unknown saved crop identity and malformed new crop inventory reject rather than erase progress', () => {
  const s = run(createGame(0), { type: 'plantCell', buildingId: 'b2', cell: 0 });
  for (const mutate of [
    (x) => (x.buildings[1].cropJobs[0].crop = 'bogus'),
    (x) => delete x.buildings[1].cropJobs[0].crop,
    (x) => (x.inventory.wheat = -1),
    (x) => delete x.inventory.lettuce,
  ]) {
    const raw = JSON.parse(JSON.stringify(s));
    mutate(raw);
    assert.throws(() => importSave(JSON.stringify(raw), 0));
  }
});
test('wheat or lettuce supply prevents unnecessary emergency carrot grant', () => {
  for (const crop of ['wheat', 'lettuce']) {
    const s = createGame(0);
    s.coins = 0;
    s.inventory.vegetable = 0;
    s.inventory[crop] = 1;
    fail(s, { type: 'recoverCrop' });
  }
});
test('new cold production and buying are retired, existing holdings and jobs remain claimable', () => {
  let s = run(createGame(0), { type: 'place', kind: 'shop', x: 2, z: 5 });
  assert.equal(s.commerce.shopStock.b3.chilledVegetable, 0);
  const legacy = JSON.parse(JSON.stringify(s));
  legacy.buildings[0].kind = 'coldWarehouse';
  legacy.buildings[0].job = { id: 'j4', startedAt: 0, readyAt: 10000 };
  legacy.nextId = 5;
  legacy.commerce.shopStock.b3.chilledVegetable = 4;
  s = importSave(JSON.stringify(legacy), 10000);
  fail(s, { type: 'start', buildingId: 'b1' });
  fail(s, {
    type: 'shopTrade',
    buildingId: 'b3',
    item: 'chilledVegetable',
    quantity: 1,
    side: 'buy',
  });
  s = run(s, { type: 'collect', buildingId: 'b1' });
  assert.equal(s.inventory.chilledVegetable, 2);
  s = run(s, {
    type: 'shopTrade',
    buildingId: 'b3',
    item: 'chilledVegetable',
    quantity: 2,
    side: 'sell',
  });
  assert.equal(s.inventory.chilledVegetable, 0);
  assert.equal(s.commerce.shopStock.b3.chilledVegetable, 4); // retained legacy data, not reissued
  assert.deepEqual(importSave(exportSave(s), 10000), s);
});
