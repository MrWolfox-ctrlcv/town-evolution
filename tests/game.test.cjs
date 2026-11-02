const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CONFIG,
  createGame,
  dispatch,
  advance,
  getCapacity,
  getUsedStorage,
  exportSave,
  importSave,
} = require('../.domain-build/domain/game.js');
function run(s, command, now = 0) {
  const r = dispatch(s, command, now);
  assert.equal(r.ok, true, r.error);
  return r.state;
}
function fail(s, command, now = 0) {
  const before = JSON.stringify(s),
    r = dispatch(s, command, now);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
  return r;
}
function harvest(s, now = 0) {
  s = run(s, { type: 'start', buildingId: 'b2' }, now);
  return run(s, { type: 'collect', buildingId: 'b2' }, now + CONFIG.cropDurationMs);
}

test('initial map provides a viable production and storage loop', () => {
  const s = createGame(0);
  assert.equal(getCapacity(s), 16);
  assert.equal(s.coins, 120);
  assert.equal(getUsedStorage(s), 0);
});
test('placement spends exactly once and does not mutate input', () => {
  const s = createGame(0),
    next = run(s, { type: 'place', kind: 'cooler', x: 5, z: 3 });
  assert.equal(s.coins, 120);
  assert.equal(next.coins, 80);
  assert.equal(next.buildings.length, 3);
  assert.equal(next.nextId, 4);
  fail(next, { type: 'place', kind: 'cooler', x: 5, z: 3 });
});
test('rejects overlap, fractional, outside and invalid placement', () => {
  const s = createGame(0);
  for (const [x, z] of [
    [3, 3],
    [11, 11],
    [-1, 0],
    [1.2, 0],
    [NaN, 0],
    [Infinity, 0],
  ])
    fail(s, { type: 'place', kind: 'farm', x, z });
  fail(s, { type: 'place', kind: 'coldWarehouse', x: 0, z: 0 });
  fail(s, { type: 'place', kind: 'farm', x: 0, z: 0, rotation: 4 });
});
test('insufficient funds rejects atomically including next id', () => {
  const s = { ...createGame(0), coins: 0 };
  fail(s, { type: 'place', kind: 'farm', x: 0, z: 0 });
  fail(s, { type: 'upgrade', buildingId: 'b1', target: 'expandedWarehouse' });
});
test('cannot start twice or collect early; completed task collects once', () => {
  let s = run(createGame(0), { type: 'start', buildingId: 'b2' });
  fail(s, { type: 'start', buildingId: 'b2' });
  fail(s, { type: 'collect', buildingId: 'b2' }, 14999);
  s = run(s, { type: 'collect', buildingId: 'b2' }, 15000);
  assert.equal(s.inventory.vegetable, 4);
  fail(s, { type: 'collect', buildingId: 'b2' }, 15000);
});
test('full warehouse keeps ready task intact until space is freed', () => {
  let s = createGame(0);
  for (let i = 0; i < 4; i++) s = harvest(s, i * 15000);
  s = run(s, { type: 'start', buildingId: 'b2' }, 60000);
  fail(s, { type: 'collect', buildingId: 'b2' }, 75000);
  assert.ok(s.buildings.find((b) => b.id === 'b2').job);
  s = run(s, { type: 'sell', orderId: 'vegetable' }, 75000);
  s = run(s, { type: 'collect', buildingId: 'b2' }, 75000);
  assert.equal(s.inventory.vegetable, 16);
});
test('order consumes inventory and grants exact reward', () => {
  let s = harvest(createGame(0));
  s = run(s, { type: 'sell', orderId: 'vegetable' }, 15000);
  assert.equal(s.coins, 144);
  assert.equal(s.inventory.vegetable, 0);
  assert.equal(s.completedOrders, 1);
  fail(s, { type: 'sell', orderId: 'vegetable' }, 15000);
  fail(s, { type: 'sell', orderId: 'bogus' }, 15000);
});
test('warehouse expansion preserves identity/stock and is not repeatable', () => {
  const base = harvest(createGame(0));
  const s = run(base, { type: 'upgrade', buildingId: 'b1', target: 'expandedWarehouse' }, 15000);
  assert.equal(getCapacity(s), 32);
  assert.equal(s.coins, 80);
  assert.equal(s.inventory.vegetable, 4);
  assert.equal(s.buildings[0].id, 'b1');
  fail(s, { type: 'upgrade', buildingId: 'b1', target: 'expandedWarehouse' }, 15000);
});
test('combination consumes adjacent cooler, retains warehouse and enables processing', () => {
  let s = run(createGame(0), { type: 'place', kind: 'cooler', x: 5, z: 3 });
  s = run(s, { type: 'combine', warehouseId: 'b1', coolerId: 'b3' });
  assert.equal(s.coins, 60);
  assert.equal(s.buildings.length, 2);
  assert.equal(s.buildings[0].kind, 'coldWarehouse');
  assert.equal(getCapacity(s), 16);
  fail(s, { type: 'start', buildingId: 'b1' });
  s = harvest(s);
  s = run(s, { type: 'start', buildingId: 'b1' }, 15000);
  assert.equal(s.inventory.vegetable, 2);
  s = run(s, { type: 'collect', buildingId: 'b1' }, 25000);
  assert.equal(s.inventory.chilledVegetable, 2);
  s = run(s, { type: 'sell', orderId: 'chilledVegetable' }, 25000);
  assert.equal(s.coins, 84);
  fail(s, { type: 'combine', warehouseId: 'b1', coolerId: 'b3' }, 25000);
});
test('combination rejects remote and diagonal cooler without consuming it', () => {
  for (const [x, z] of [
    [0, 0],
    [5, 5],
  ]) {
    const s = run(createGame(0), { type: 'place', kind: 'cooler', x, z });
    fail(s, { type: 'combine', warehouseId: 'b1', coolerId: 'b3' });
  }
});
test('clock rollback does not shorten production or decrease lastSeenAt', () => {
  let s = createGame(100000);
  s = run(s, { type: 'start', buildingId: 'b2' }, 0);
  assert.equal(s.buildings[1].job.readyAt, 115000);
  fail(s, { type: 'collect', buildingId: 'b2' }, 1000);
  assert.equal(advance(s, 1).lastSeenAt, 100000);
});
test('offline time completes only scheduled task, never auto-repeats', () => {
  let s = run(createGame(0), { type: 'start', buildingId: 'b2' });
  s = importSave(exportSave(s), 1000000000);
  assert.equal(s.inventory.vegetable, 0);
  s = run(s, { type: 'collect', buildingId: 'b2' }, 1000000000);
  assert.equal(s.inventory.vegetable, 4);
  assert.equal(s.buildings[1].job, undefined);
});
test('valid save round trips and rejects unsupported version', () => {
  const s = createGame(10);
  assert.deepEqual(importSave(exportSave(s), 10), s);
  assert.throws(() => importSave('{', 0));
  assert.throws(() => importSave(JSON.stringify({ ...s, schemaVersion: 2 }), 0));
});
test('malformed saves cannot create invalid inventory, map, ids, times or jobs', () => {
  const alterations = [
    (s) => (s.coins = -1),
    (s) => (s.inventory.vegetable = 999),
    (s) => (s.inventory.vegetable = 1.5),
    (s) => (s.buildings[1].x = 3),
    (s) => (s.buildings[1].kind = '__proto__'),
    (s) => (s.buildings[1].id = 'b1'),
    (s) => (s.nextId = 1),
    (s) => (s.buildings[0].x = 12),
    (s) => (s.buildings[0].rotation = 2),
    (s) => (s.lastSeenAt = -1),
    (s) => (s.buildings[0].job = { id: 'j5', startedAt: 0, readyAt: 15000 }),
    (s) => (s.buildings[1].job = { id: 'j5', startedAt: 0, readyAt: 1 }),
  ];
  for (const mutate of alterations) {
    const s = createGame(0);
    mutate(s);
    assert.throws(() => importSave(JSON.stringify(s), 0));
  }
});
test('invalid operation/time and missing target reject safely', () => {
  const s = createGame(0);
  fail(s, { type: 'wat' });
  fail(s, null);
  fail(s, { type: 'start', buildingId: 'missing' });
  fail(s, { type: 'start', buildingId: 'b2' }, NaN);
  assert.throws(() => createGame(-1));
});
test('100 repeated complete loops preserve storage and money invariants', () => {
  let s = createGame(0);
  for (let i = 0; i < 100; i++) {
    s = harvest(s, i * 15000);
    s = run(s, { type: 'sell', orderId: 'vegetable' }, (i + 1) * 15000);
    s = importSave(exportSave(s), (i + 1) * 15000);
  }
  assert.equal(s.coins, 2520);
  assert.equal(s.completedOrders, 100);
  assert.equal(getUsedStorage(s), 0);
});
test('cold output blocked by full storage preserves job without taking more inputs', () => {
  let s = run(createGame(0), { type: 'place', kind: 'cooler', x: 5, z: 3 });
  s = run(s, { type: 'combine', warehouseId: 'b1', coolerId: 'b3' });
  s = harvest(s);
  s = run(s, { type: 'start', buildingId: 'b1' }, 15000); // 2 vegetables remain; output will be 2
  s = { ...s, inventory: { vegetable: 16, chilledVegetable: 0 } }; // simulate other farms filling storage during processing
  fail(s, { type: 'collect', buildingId: 'b1' }, 25000);
  assert.ok(s.buildings[0].job);
  assert.equal(s.inventory.vegetable, 16);
  s = run(s, { type: 'sell', orderId: 'vegetable' }, 25000);
  s = run(s, { type: 'collect', buildingId: 'b1' }, 25000);
  assert.equal(s.inventory.chilledVegetable, 2);
});
test('maximum counter/time limits reject atomically', () => {
  let s = { ...createGame(0), nextId: 1000000000 };
  fail(s, { type: 'start', buildingId: 'b2' });
  s = createGame(8000000000000000);
  fail(s, { type: 'start', buildingId: 'b2' }, 8000000000000000);
  s = { ...createGame(0), coins: 1000000000, inventory: { vegetable: 4, chilledVegetable: 0 } };
  fail(s, { type: 'sell', orderId: 'vegetable' });
});
