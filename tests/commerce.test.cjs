const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  dispatch,
  importSave,
  exportSave,
  COMMERCE,
} = require('../.domain-build/domain/game.js');
const { SAVE_KEY, BACKUP_KEY, loadGame, saveGame } = require('../.domain-build/domain/storage.js');

const { validatePlacement } = require('../.domain-build/domain/geometry.js');
const {
  CONFIG,
  isDockShore,
  isLandCell,
  landCellCount,
} = require('../.domain-build/domain/game.js');
function place(s, kind) {
  for (let z = 0; z < CONFIG.gridSize; z++) {
    for (let x = 0; x < CONFIG.gridSize; x++) {
      const b = { id: `b${s.nextId}`, kind, x, z, rotation: 0 };
      try {
        validatePlacement(s, b);
      } catch {
        continue;
      }
      if (kind === 'dock' && !isDockShore(b, s.mapSeed)) continue;
      return run(s, { type: 'place', kind, x, z });
    }
  }
  assert.fail(`No legal placement for ${kind}`);
}

function run(s, c, now = s.lastSeenAt) {
  const before = JSON.stringify(s),
    r = dispatch(s, c, now);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), before);
  return r.state;
}
function fail(s, c, now = s.lastSeenAt) {
  const before = JSON.stringify(s),
    r = dispatch(s, c, now);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
}
function setup() {
  let s = createGame(0);
  for (const kind of ['shop', 'orderBoard', 'dock']) s = place(s, kind);
  return {
    ...s,
    inventory: { vegetable: 12, chilledVegetable: 4, wheat: 0, lettuce: 0, wood: 0, stone: 0 },
  };
}
const shop = (side, quantity, item = 'vegetable') => ({
  type: 'shopTrade',
  buildingId: 'b3',
  side,
  quantity,
  item,
});
const transfer = (direction, quantity, item = 'vegetable') => ({
  type: 'dockTransfer',
  buildingId: 'b5',
  direction,
  quantity,
  item,
});
const ship = (shipmentId = 1) => ({ type: 'dockShip', buildingId: 'b5', shipmentId });
const collect = (shipmentId = 1) => ({ type: 'dockCollect', buildingId: 'b5', shipmentId });
test('shop sells immediately, buys use finite quota, no profitable round trip', () => {
  let s = setup();
  s = run(s, shop('sell', 4));
  assert.equal(s.coins, 60);
  assert.equal(s.inventory.vegetable, 8);
  s = run(s, shop('buy', 4));
  assert.equal(s.coins, 28);
  assert.equal(s.commerce.shopStock.b3.vegetable, 4);
  assert.equal(s.inventory.vegetable, 12);
  fail(s, shop('buy', 1)); // full storage
  s = run(s, shop('sell', 11));
  s = run(s, shop('buy', 4));
  fail(s, shop('buy', 1)); // exhausted quota
  assert.equal(s.commerce.shopStock.b3.vegetable, 0);
});
test('shop rejects bad quantities, unknown items, invalid direction, missing or wrong facility atomically', () => {
  const s = setup();
  for (const q of [0, -1, 1.5, NaN, Infinity, 1000000001]) fail(s, shop('sell', q));
  for (const c of [
    shop('sell', 99),
    shop('bogus', 1),
    shop('sell', 1, '__proto__'),
    { ...shop('sell', 1), buildingId: 'missing' },
    { ...shop('sell', 1), buildingId: 'b2' },
  ])
    fail(s, c);
  fail({ ...s, coins: 1000000000 }, shop('sell', 1));
});
test('bulk order is facility gated, exact and rejects replayed offer', () => {
  const c = { type: 'orderFulfill', buildingId: 'b4', orderId: 'vegetable', offerId: 1 };
  const s = run(setup(), c);
  assert.equal(s.coins, 96);
  assert.equal(s.inventory.vegetable, 4);
  assert.equal(s.completedOrders, 1);
  assert.equal(s.commerce.offerId, 2);
  fail(s, c);
  fail(s, { ...c, offerId: 2 });
  fail(createGame(0), { type: 'sell', orderId: 'vegetable' });
  fail(setup(), { ...c, buildingId: 'b3' });
});
test('staging moves cargo, never sells, returns are atomic on full warehouse', () => {
  const initial = setup();
  let s = run(initial, transfer('stage', 8));
  assert.equal(s.coins, initial.coins);
  assert.equal(s.inventory.vegetable, 4);
  assert.equal(s.commerce.dockCargo.b5.vegetable, 8);
  s = run(s, transfer('return', 8));
  assert.deepEqual(s.inventory, initial.inventory);
  s = run(s, transfer('stage', 8));
  s = {
    ...s,
    inventory: { vegetable: 16, chilledVegetable: 0, wheat: 0, lettuce: 0, wood: 0, stone: 0 },
  };
  fail(s, transfer('return', 1));
  fail(s, transfer('stage', 9));
  fail(s, transfer('return', 9));
  fail(s, transfer('bogus', 1));
});
test('ship snapshots in-transit cargo; collect once after30s, independently of warehouse capacity', () => {
  let s = run(setup(), transfer('stage', 8));
  s = run(s, ship(), 100);
  assert.equal(s.coins, 40);
  assert.equal(s.commerce.dockCargo.b5.vegetable, 0);
  assert.equal(s.commerce.shipments.b5.cargo.vegetable, 8);
  assert.equal(s.commerce.shipments.b5.reward, 48);
  fail(s, transfer('return', 1));
  fail(s, ship());
  fail(s, collect(), 30099);
  s = run(s, transfer('stage', 4)); // can stage next cargo while sailing
  fail(s, ship(2));
  s = {
    ...s,
    inventory: { vegetable: 16, chilledVegetable: 0, wheat: 0, lettuce: 0, wood: 0, stone: 0 },
  };
  s = run(s, collect(), 30100);
  assert.equal(s.coins, 88);
  assert.equal(s.inventory.vegetable, 16);
  assert.equal(s.commerce.dockCargo.b5.vegetable, 4);
  fail(s, collect());
  s = run(s, ship(2));
  assert.equal(s.commerce.shipments.b5.id, 2);
});
test('overflow settlement keeps shipment recoverable, offline import unlocks settlement only', () => {
  let s = run(run(setup(), transfer('stage', 4)), ship());
  s = importSave(exportSave(s), 90000);
  assert.equal(s.coins, 40);
  assert.ok(s.commerce.shipments.b5);
  fail({ ...s, coins: 1000000000 }, collect());
  s = run(s, collect(), 0);
  assert.equal(s.coins, 64); // monotonic clock
});
test('old test saves are rejected on import and cleared by the authorized storage reset', () => {
  for (let version = 1; version <= 7; version++) {
    const old = { ...createGame(100), schemaVersion: version };
    const raw = JSON.stringify(old);
    assert.throws(() => importSave(raw, 100));
    const map = new Map([
      [SAVE_KEY, raw],
      [BACKUP_KEY, raw],
      ['unrelated', 'keep'],
    ]);
    const storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    };
    assert.equal(loadGame(storage, 100).status, 'empty');
    assert.equal(map.has(SAVE_KEY), false);
    assert.equal(map.has(BACKUP_KEY), false);
    assert.equal(map.get('unrelated'), 'keep');
    const fresh = createGame(100);
    saveGame(storage, fresh);
    assert.deepEqual(loadGame(storage, 100).state, fresh);
    assert.equal(JSON.parse(map.get(SAVE_KEY)).schemaVersion, 8);
  }
});
test('current save strict validation rejects malformed cargo, facilities, shipment rewards/tokens/times', () => {
  const s = run(run(setup(), transfer('stage', 4)), ship());
  assert.deepEqual(importSave(exportSave(s), 0), s);
  for (const mutate of [
    (x) => delete x.commerce,
    (x) => (x.commerce.dockCargo.b5.vegetable = 17),
    (x) => (x.commerce.dockCargo.b5.vegetable = -1),
    (x) =>
      (x.commerce.dockCargo.missing = {
        vegetable: 0,
        chilledVegetable: 0,
        wheat: 0,
        lettuce: 0,
        wood: 0,
        stone: 0,
      }),
    (x) => delete x.commerce.shopStock.b3,
    (x) => (x.commerce.shopStock.b3.vegetable = 9),
    (x) => x.commerce.shipments.b5.reward++,
    (x) => (x.commerce.shipments.b5.id = x.commerce.shipmentId),
    (x) => x.commerce.shipments.b5.completeAt++,
    (x) => (x.commerce.shipments.b5.startedAt = 1),
    (x) => (x.schemaVersion = 1),
  ]) {
    const raw = JSON.parse(JSON.stringify(s));
    mutate(raw);
    assert.throws(() => importSave(JSON.stringify(raw), 0));
  }
  assert.equal(COMMERCE.shippingDurationMs, 30000);
});
test('purchase money limits, empty shipments and wrong facilities never mutate state', () => {
  let s = {
    ...setup(),
    coins: 0,
    inventory: { vegetable: 0, chilledVegetable: 0, wheat: 0, lettuce: 0, wood: 0, stone: 0 },
  };
  fail(s, shop('buy', 1));
  fail(s, ship());
  fail(s, collect());
  for (const c of [transfer('stage', 1), ship(), collect()]) {
    fail(s, { ...c, buildingId: 'missing' });
    fail(s, { ...c, buildingId: 'b3' });
  }
  s = setup();
  fail(s, { type: 'orderFulfill', buildingId: 'b4', orderId: 'vegetable', offerId: NaN });
  fail(
    { ...s, completedOrders: 1000000000 },
    { type: 'orderFulfill', buildingId: 'b4', orderId: 'vegetable', offerId: 1 },
  );
  s = run(s, transfer('stage', 1));
  fail(s, ship(NaN));
  fail(s, ship(), 8000000000000000);
});
test('two docks keep independent cargo and shipment receipts', () => {
  let s = { ...setup(), coins: 100 };
  s = place(s, 'dock');
  s = run(s, transfer('stage', 4));
  s = run(s, ship());
  s = run(s, { ...transfer('stage', 4, 'chilledVegetable'), buildingId: 'b6' });
  s = run(s, { ...ship(2), buildingId: 'b6' });
  assert.equal(s.commerce.shipments.b5.reward, 24);
  assert.equal(s.commerce.shipments.b6.reward, 48);
  fail(s, { ...collect(1), buildingId: 'b6' }, 30000);
  s = run(s, collect(1), 30000);
  assert.ok(s.commerce.shipments.b6);
  s = run(s, { ...collect(2), buildingId: 'b6' });
  assert.equal(s.coins, 122);
  assert.deepEqual(importSave(exportSave(s), 30000), s);
});
test('mixed commerce command sequences conserve goods and preserve rejected snapshots', () => {
  let s = { ...setup(), coins: 500 },
    seed = 19;
  const random = (n) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % n;
  };
  const total = (x) =>
    x.inventory.vegetable +
    x.inventory.chilledVegetable +
    Object.values(x.commerce.dockCargo).reduce((n, c) => n + c.vegetable + c.chilledVegetable, 0) +
    Object.values(x.commerce.shipments).reduce(
      (n, c) => n + c.cargo.vegetable + c.cargo.chilledVegetable,
      0,
    );
  for (let i = 0; i < 400; i++) {
    const q = random(5) + 1,
      item = random(2) ? 'vegetable' : 'chilledVegetable';
    const commands = [
      shop('buy', q, item),
      shop('sell', q, item),
      transfer('stage', q, item),
      transfer('return', q, item),
      ship(s.commerce.shipmentId),
      collect(s.commerce.shipments.b5?.id ?? 1),
      { type: 'orderFulfill', buildingId: 'b4', orderId: item, offerId: s.commerce.offerId },
    ];
    const c = commands[random(commands.length)],
      before = JSON.stringify(s),
      oldTotal = total(s),
      r = dispatch(s, c, i * 1000);
    assert.equal(JSON.stringify(s), before);
    if (!r.ok) {
      assert.equal(r.state, s);
      continue;
    }
    let expected = oldTotal;
    if (c.type === 'shopTrade') expected += c.side === 'buy' ? q : -q;
    if (c.type === 'orderFulfill') expected -= COMMERCE.orders[item].amount;
    if (c.type === 'dockCollect')
      expected -=
        s.commerce.shipments.b5.cargo.vegetable + s.commerce.shipments.b5.cargo.chilledVegetable;
    s = r.state;
    assert.equal(total(s), expected);
    assert.deepEqual(importSave(exportSave(s), s.lastSeenAt), s);
  }
});
test('zero-coin current towns can build a free board and recover income', () => {
  let s = createGame(0);
  for (let i = 0; i < 6; i++) s = place(s, 'farm');
  assert.equal(s.coins, 0);
  s = importSave(exportSave(s), 0);
  assert.equal(s.coins, 0);
  s = place(s, 'orderBoard');
  assert.equal(s.coins, 0);
  assert.equal(s.inventory.vegetable, 1);
  const board = s.buildings.find((b) => b.kind === 'orderBoard');
  for (const t of [0, 15000, 30000, 45000, 60000, 75000, 90000]) {
    s = run(s, { type: 'start', buildingId: 'b2' }, t);
    s = run(s, { type: 'collect', buildingId: 'b2' }, t + 15000);
  }
  s = run(s, { type: 'orderFulfill', buildingId: board.id, orderId: 'vegetable', offerId: 1 });
  assert.equal(s.coins, 56);
  assert.equal(s.inventory.vegetable, 0);
  s = place(s, 'orderBoard');
  assert.equal(s.coins, 56);
  assert.equal(s.commerce.offerId, 2);
});
function fullCurrentTown(lastCellEmpty = false) {
  const s = createGame(0);
  s.coins = 0;
  s.buildings = [];
  s.trees = [];
  s.inventory = { vegetable: 0, chilledVegetable: 0, wheat: 0, lettuce: 0, wood: 0, stone: 0 };
  for (let z = 0; z < CONFIG.gridSize; z++)
    for (let x = 0; x < CONFIG.gridSize; x++) {
      if (!isLandCell(x, z, s.mapSeed)) continue;
      s.buildings.push({ id: `b${s.buildings.length + 1}`, kind: 'cooler', x, z, rotation: 0 });
    }
  if (lastCellEmpty) s.buildings.pop();
  s.nextId = s.buildings.length + 1;
  return importSave(JSON.stringify(s), 0);
}
test('last free island tile is reserved for the free order board', () => {
  let s = { ...fullCurrentTown(true), coins: 40 };
  let cell;
  for (let z = 0; z < CONFIG.gridSize; z++)
    for (let x = 0; x < CONFIG.gridSize; x++) {
      if (isLandCell(x, z, s.mapSeed) && !s.buildings.some((b) => b.x === x && b.z === z))
        cell = { x, z };
    }
  assert.ok(cell);
  fail(s, { type: 'place', kind: 'cooler', ...cell });
  s = run(s, { type: 'place', kind: 'orderBoard', ...cell });
  assert.equal(s.coins, 40);
  assert.equal(s.buildings.length, landCellCount(s.mapSeed));
});
test('explicit full-island recovery keeps id, location, goods and coins', () => {
  const s = fullCurrentTown(),
    original = s.buildings[0];
  const next = run(s, { type: 'repurposeToBoard', buildingId: original.id });
  assert.deepEqual(next.buildings[0], { ...original, kind: 'orderBoard' });
  assert.deepEqual(next.inventory, s.inventory);
  assert.equal(next.coins, 0);
  assert.equal(next.nextId, s.nextId);
  assert.equal(next.buildings.length, landCellCount(s.mapSeed));
  fail(next, { type: 'repurposeToBoard', buildingId: 'b2' });
  assert.deepEqual(importSave(exportSave(next), 0), next);
});
test('repurpose refuses active farm and warehouse, permits idle farm without refund', () => {
  const s = createGame(0),
    command = { type: 'repurposeToBoard', buildingId: 'b2' };
  fail(run(s, { type: 'start', buildingId: 'b2' }), command);
  fail(s, { ...command, buildingId: 'b1' });
  fail(s, { ...command, buildingId: 'missing' });
  const withFarm = place(s, 'farm');
  const next = run(withFarm, command);
  assert.equal(next.buildings[1].kind, 'orderBoard');
  assert.equal(next.coins, 100);
  assert.deepEqual(next.inventory, s.inventory);
});

test('recovery cannot remove the last farm after spending all starting coins', () => {
  let s = createGame(0);
  for (let i = 0; i < 3; i++) s = place(s, 'cooler');
  assert.equal(s.coins, 0);
  fail(s, { type: 'repurposeToBoard', buildingId: 'b2' });
  s = run(s, { type: 'repurposeToBoard', buildingId: 'b3' });
  assert.equal(s.buildings.find((b) => b.id === 'b2').kind, 'farm');
  for (const t of [0, 15000, 30000, 45000, 60000, 75000, 90000]) {
    s = run(s, { type: 'start', buildingId: 'b2' }, t);
    s = run(s, { type: 'collect', buildingId: 'b2' }, t + 15000);
  }
  s = run(s, { type: 'orderFulfill', buildingId: 'b3', orderId: 'vegetable', offerId: 1 });
  assert.equal(s.coins, 56);
});
