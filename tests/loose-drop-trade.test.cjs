/** Real domain transactions and saves. No Cocos editor or renderer is exercised. */
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { MAX_VALUE } = require('../.domain-build/domain/config');
const { fixture, trade, merge, apply, reject } = require('./helpers/loose-drop-trade.cjs');
for (const crop of g.CROP_KEYS)
  for (const kind of ['shop', 'dock'])
    test(`${crop} harvested drop transfers whole to ${kind} without warehouse space or automatic sailing`, () => {
      const f = fixture(crop);
      f.state.inventory.wood = g.getCapacity(f.state);
      const command = trade(f, kind),
        next = apply(f.state, command);
      assert.deepEqual(next.inventory, f.state.inventory);
      assert.deepEqual(next.groundStacks, f.state.groundStacks);
      assert.equal(next.looseDrops.length, 0);
      assert.equal(next.nextId, f.state.nextId);
      assert.deepEqual(next.fusion, f.state.fusion);
      assert.deepEqual(next.commerce.shipments, f.state.commerce.shipments);
      assert.equal(next.commerce.shipmentId, f.state.commerce.shipmentId);
      if (kind === 'shop') {
        assert.equal(next.coins, f.state.coins + f.drop.amount * g.COMMERCE.prices[crop].sell);
        assert.deepEqual(next.commerce, f.state.commerce);
      } else {
        assert.equal(next.coins, f.state.coins);
        assert.equal(next.commerce.dockCargo[f.dock.id][crop], f.drop.amount);
      }
      reject(next, command);
    });
test('loose sale and staging reject stale full snapshots, forged sources and reversed directions atomically', () => {
  const f = fixture();
  for (const kind of ['shop', 'dock']) {
    const command = trade(f, kind);
    for (const patch of [
      { id: 'd9999' },
      { item: 'wheat' },
      { amount: 1 },
      { x6: f.drop.x6 + 1 },
      { z6: f.drop.z6 + 1 },
    ])
      reject(f.state, {
        ...command,
        source: { type: 'drop', drop: { ...command.source.drop, ...patch } },
      });
    for (const source of [
      null,
      {},
      { type: 'unknown', drop: command.source.drop },
      { type: 'drop' },
      { type: 'drop', drop: null },
    ])
      reject(f.state, { ...command, source });
    for (const quantity of [0, 1, 3, 1.5, NaN, Infinity]) reject(f.state, { ...command, quantity });
    reject(f.state, { ...command, item: 'wheat' });
    reject(f.state, { ...command, buildingId: 'missing' });
    reject(f.state, { ...command, buildingId: f.farm.id });
  }
  reject(f.state, { ...trade(f, 'shop'), side: 'buy' });
  reject(f.state, { ...trade(f, 'dock'), direction: 'return' });
  reject({ ...f.state, coins: MAX_VALUE }, trade(f, 'shop'));
});
test('dock accepts an exact fit, refuses a partial fit, and preserves any voyage already sailing', () => {
  const f = fixture(),
    command = trade(f, 'dock');
  f.state.commerce.dockCargo[f.dock.id].wheat = g.COMMERCE.dockCapacity - 1;
  reject(f.state, command);
  f.state.commerce.dockCargo[f.dock.id].wheat--;
  let next = apply(f.state, command);
  assert.equal(next.commerce.dockCargo[f.dock.id].vegetable, f.drop.amount);
  next = apply(next, {
    type: 'dockShip',
    buildingId: f.dock.id,
    shipmentId: next.commerce.shipmentId,
  });
  next.looseDrops = structuredClone(f.state.looseDrops);
  const voyage = structuredClone(next.commerce.shipments[f.dock.id]);
  next = apply(next, command);
  assert.deepEqual(next.commerce.shipments[f.dock.id], voyage);
  assert.equal(next.commerce.dockCargo[f.dock.id].vegetable, f.drop.amount);
});
test('natural material drops are not sold or staged through the agricultural drag route', () => {
  for (const item of ['soil', 'stone']) {
    const f = fixture();
    f.drop.item = item;
    f.drop.x6 = 63;
    f.drop.z6 = 63;
    f.drop.source = { type: 'natural', resourceId: 'n10_10', kind: item };
    for (const kind of ['shop', 'dock']) reject(f.state, trade(f, kind));
  }
});
for (const crop of g.CROP_KEYS)
  test(`sidebar ${crop} adds one unit to the precise target, without changing origin or inventing IDs`, () => {
    const f = fixture(crop);
    f.state.inventory[crop] = 3;
    const command = merge(f.state),
      bytes = g.exportSave(f.state);
    assert.deepEqual(g.stockIntoDropPlan(f.state, command), {
      transferAmount: 1,
      remaining: 2,
      reason: null,
    });
    assert.equal(g.exportSave(f.state), bytes);
    const next = apply(f.state, command);
    assert.equal(next.inventory[crop], 2);
    assert.deepEqual(next.looseDrops, [{ ...f.drop, amount: f.drop.amount + 1 }]);
    assert.equal(next.nextId, f.state.nextId);
    assert.deepEqual(next.commerce, f.state.commerce);
    assert.deepEqual(next.groundStacks, f.state.groundStacks);
    reject(next, command);
  });
test('sidebar merges reject full, different, missing, changed and malformed sources or targets', () => {
  const f = fixture();
  f.state.inventory.vegetable = 3;
  const command = merge(f.state);
  for (const source of [
    null,
    {},
    { item: 'unknown', amount: 3 },
    { item: 'vegetable', amount: 2 },
    { item: 'vegetable', amount: NaN },
    { item: 'vegetable', amount: -1 },
  ])
    reject(f.state, { ...command, source });
  f.state.inventory.wheat = 3;
  reject(f.state, { ...command, source: { item: 'wheat', amount: 3 } });
  for (const patch of [{ amount: 1 }, { item: 'wheat' }, { id: 'missing' }, { x6: 1 }, { z6: 1 }])
    reject(f.state, { ...command, target: { ...command.target, ...patch } });
  reject(f.state, { ...command, target: null });
  f.drop.amount = g.stackLimitFor(f.drop.item);
  reject(f.state, merge(f.state));
  f.drop.amount--;
  const filled = apply(f.state, merge(f.state));
  assert.equal(filled.looseDrops[0].amount, 10);
  assert.equal(filled.inventory.vegetable, 2);
});
test('v6 soil and stone merge exact fractional quanta and keep overflow in the inventory across save/load', () => {
  const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
  const prep = new V6WorldPreparation(1937);
  while (prep.step(50000).status !== 'ready') {}
  prep.takeResult();
  let state = g.createGame(1000, 1937, 6);
  state = apply(state, {
    type: 'editTerrain6',
    kind: 'dig',
    x: 77,
    z: 43,
    level: g.terrain6EditLevel(state, 77, 43, 'dig'),
    expectedOperation: state.terrain6.nextOperation,
  });
  for (const item of ['soil', 'stone']) {
    const drop = state.looseDrops.find((d) => d.item === item);
    assert.ok(drop);
    state.inventory[item] = 0.5;
    const initialAmount = drop.amount;
    state = apply(state, merge(state, drop));
    assert.equal(state.inventory[item], 0);
    assert.equal(state.looseDrops.find((d) => d.id === drop.id).amount, initialAmount + 0.5);
    const target = state.looseDrops.find((d) => d.id === drop.id);
    target.amount = g.stackLimitFor(item) - 1 / 4096;
    state.inventory[item] = 2;
    state = apply(state, merge(state, target));
    assert.equal(state.inventory[item], 2 - 1 / 4096);
    assert.equal(state.looseDrops.find((d) => d.id === drop.id).amount, g.stackLimitFor(item));
    reject(
      state,
      merge(
        state,
        state.looseDrops.find((d) => d.id === drop.id),
      ),
    );
  }
});
