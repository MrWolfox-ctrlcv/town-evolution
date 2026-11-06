const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const {
  emptyStock,
  initializeFacility,
  shippingReward,
} = require('../.domain-build/domain/commerce');
const { MAX_TIME, MAX_VALUE } = require('../.domain-build/domain/config');
function town() {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = emptyStock();
  const dock = { id: 'b3', kind: 'dock', x: 7, z: 18, rotation: 0 };
  s.buildings.push(dock);
  s.nextId = 4;
  initializeFacility(s.commerce, dock);
  s.commerce.dockCargo.b3 = { ...emptyStock(), flour: 2, rice: 2 };
  return s;
}
function start(s = town()) {
  const r = g.dispatch(s, { type: 'dockShip', buildingId: 'b3', shipmentId: 1 }, 1000);
  assert.equal(r.ok, true, r.error);
  return r.state;
}
function reject(s, c, now = 1000) {
  const before = JSON.stringify(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
}
test('new voyages snapshot all prices and exact duration, survive later balance edits and collect once', () => {
  let s = start();
  const job = s.commerce.shipments.b3,
    oldDuration = g.COMMERCE.shippingDurationMs,
    oldRice = g.COMMERCE.prices.rice.ship,
    oldFlour = g.COMMERCE.prices.flour.ship;
  assert.equal(job.durationMs, 30000);
  assert.equal(job.unitPrices.rice, oldRice);
  assert.equal(job.unitPrices.flour, oldFlour);
  const reward = job.reward,
    coins = s.coins;
  try {
    g.COMMERCE.shippingDurationMs = 60000;
    g.COMMERCE.prices.rice.ship = 99;
    g.COMMERCE.prices.flour.ship = 88;
    s = g.importSave(g.exportSave(s), job.completeAt);
    assert.equal(s.commerce.shipments.b3.reward, reward);
    const r = g.dispatch(
      s,
      { type: 'dockCollect', buildingId: 'b3', shipmentId: 1 },
      job.completeAt,
    );
    assert.equal(r.ok, true, r.error);
    assert.equal(r.state.coins, coins + reward);
    reject(r.state, { type: 'dockCollect', buildingId: 'b3', shipmentId: 1 }, job.completeAt);
  } finally {
    g.COMMERCE.shippingDurationMs = oldDuration;
    g.COMMERCE.prices.rice.ship = oldRice;
    g.COMMERCE.prices.flour.ship = oldFlour;
  }
});
test('legacy unsnapshotted voyages retain fixed original terms even after current price and duration change', () => {
  const s = town(),
    cargo = { ...emptyStock(), wheat: 2 };
  s.commerce.dockCargo.b3 = emptyStock();
  s.commerce.shipmentId = 2;
  s.commerce.shipments.b3 = {
    id: 1,
    cargo,
    reward: shippingReward(cargo),
    startedAt: 1000,
    completeAt: 31000,
  };
  const saved = JSON.stringify(s),
    oldDuration = g.COMMERCE.shippingDurationMs,
    oldPrice = g.COMMERCE.prices.wheat.ship;
  try {
    g.COMMERCE.shippingDurationMs = 90000;
    g.COMMERCE.prices.wheat.ship = 50;
    const loaded = g.importSave(saved, 31000);
    assert.deepEqual(loaded.commerce.shipments.b3, s.commerce.shipments.b3);
    assert.equal(loaded.commerce.shipments.b3.reward, 12);
  } finally {
    g.COMMERCE.shippingDurationMs = oldDuration;
    g.COMMERCE.prices.wheat.ship = oldPrice;
  }
});
test('malformed snapshot pairs, inconsistent rewards, price types and timing reject import without repairs', () => {
  const s = start(),
    text = g.exportSave(s);
  for (const mutate of [
    (j) => delete j.durationMs,
    (j) => delete j.unitPrices,
    (j) => {
      j.reward++;
    },
    (j) => {
      j.completeAt++;
    },
    (j) => {
      j.unitPrices.flour = -1;
    },
    (j) => {
      j.unitPrices.rice = '6';
    },
    (j) => {
      j.unitPrices.rice = 0;
    },
    (j) => {
      j.durationMs = 0;
    },
    (j) => {
      j.unitPrices.unknown = 3;
    },
    (j) => {
      j.reward = MAX_VALUE + 1;
    },
  ]) {
    const raw = JSON.parse(text);
    mutate(raw.commerce.shipments.b3);
    assert.throws(() => g.importSave(JSON.stringify(raw), 1000));
  }
});
test('invalid live price or duration configuration cannot take cargo or allocate a shipment', () => {
  const s = town(),
    oldDuration = g.COMMERCE.shippingDurationMs,
    oldPrice = g.COMMERCE.prices.flour.ship,
    command = { type: 'dockShip', buildingId: 'b3', shipmentId: 1 };
  try {
    for (const duration of [0, -1, Infinity]) {
      g.COMMERCE.shippingDurationMs = duration;
      reject(s, command);
    }
    g.COMMERCE.shippingDurationMs = oldDuration;
    for (const price of [0, -1, Infinity, MAX_VALUE]) {
      g.COMMERCE.prices.flour.ship = price;
      reject(s, command);
    }
    g.COMMERCE.prices.flour.ship = oldPrice;
    reject(s, command, MAX_TIME);
  } finally {
    g.COMMERCE.shippingDurationMs = oldDuration;
    g.COMMERCE.prices.flour.ship = oldPrice;
  }
});
test('successful commands deeply clone price snapshots instead of aliasing existing shipping contracts', () => {
  const s = start(),
    r = g.dispatch(s, { type: 'rotateBuilding', buildingId: 'b1' }, 1000);
  assert.equal(r.ok, true);
  assert.notEqual(r.state.commerce.shipments.b3.unitPrices, s.commerce.shipments.b3.unitPrices);
  r.state.commerce.shipments.b3.unitPrices.rice++;
  assert.equal(s.commerce.shipments.b3.unitPrices.rice, g.COMMERCE.prices.rice.ship);
});
