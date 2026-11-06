/** Isolated deterministic command coverage; no placement, renderer or save claims. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGame, clone } = require('../.domain-build/domain/state.js');
const { COMMERCE, emptyStock, stockTotal } = require('../.domain-build/domain/commerce.js');
const { MAX_VALUE } = require('../.domain-build/domain/config.js');
const { transportDeliver } = require('../.domain-build/domain/actions/transport.js');

function setup() {
  const state = createGame(100, 11);
  state.buildings[0].kind = 'transportWarehouse';
  state.buildings.push(
    { id: 'b3', kind: 'shop', x: 12, z: 12, rotation: 0 },
    { id: 'b4', kind: 'dock', x: 15, z: 15, rotation: 0 },
  );
  state.nextId = 5;
  state.commerce.shopStock.b3 = { ...emptyStock(), vegetable: 8, wheat: 8, lettuce: 8 };
  state.commerce.dockCargo.b4 = emptyStock();
  state.inventory = { ...emptyStock(), vegetable: 7, wheat: 4, wood: 2, soil: 3 };
  return state;
}

const command = (targetId = 'b4', cargo = [{ item: 'vegetable', quantity: 4 }]) => ({
  type: 'transportDeliver',
  buildingId: 'b1',
  targetId,
  cargo,
});

function rejects(state, instruction, pattern) {
  const before = structuredClone(state);
  assert.throws(() => transportDeliver(state, instruction), pattern);
  assert.deepEqual(state, before, 'A rejected manifest must not mutate any part of the town');
}

test('mixed shop delivery deducts exact inventory and credits existing sell prices once', () => {
  const state = setup();
  const before = structuredClone(state);
  const instruction = command('b3', [
    { item: 'vegetable', quantity: 4 },
    { item: 'wheat', quantity: 2 },
    { item: 'wood', quantity: 1 },
  ]);
  const manifest = structuredClone(instruction);
  const events = transportDeliver(state, instruction);
  assert.equal(state.inventory.vegetable, 3);
  assert.equal(state.inventory.wheat, 2);
  assert.equal(state.inventory.wood, 1);
  assert.equal(state.inventory.soil, before.inventory.soil);
  const reward =
    4 * COMMERCE.prices.vegetable.sell + 2 * COMMERCE.prices.wheat.sell + COMMERCE.prices.wood.sell;
  assert.equal(state.coins, before.coins + reward);
  assert.deepEqual(state.commerce, before.commerce, 'Selling does not refill shop purchase quotas');
  assert.deepEqual(state.buildings, before.buildings);
  assert.deepEqual(instruction, manifest, 'The UI command remains immutable');
  assert.deepEqual(events, [`已向商店出售7份货物，获得${reward}金币`]);
});

test('mixed dock delivery conserves every item and never launches, pays or alters jobs', () => {
  const state = setup();
  state.commerce.dockCargo.b4.lettuce = 3;
  const before = structuredClone(state);
  const events = transportDeliver(
    state,
    command('b4', [
      { item: 'vegetable', quantity: 7 },
      { item: 'wheat', quantity: 4 },
      { item: 'wood', quantity: 2 },
    ]),
  );
  assert.equal(stockTotal(state.commerce.dockCargo.b4), COMMERCE.dockCapacity);
  for (const item of Object.keys(state.inventory))
    assert.equal(
      state.inventory[item] + state.commerce.dockCargo.b4[item],
      before.inventory[item] + before.commerce.dockCargo.b4[item],
    );
  assert.equal(state.coins, before.coins);
  assert.deepEqual(state.commerce.shipments, before.commerce.shipments);
  assert.equal(state.commerce.shipmentId, before.commerce.shipmentId);
  assert.equal(state.commerce.offerId, before.commerce.offerId);
  assert.deepEqual(state.buildings, before.buildings);
  assert.equal(state.lastSeenAt, before.lastSeenAt, 'The dispatcher owns clock advancement');
  assert.deepEqual(events, ['已向船坞装入13份货物，尚未发船']);
});

test('one insufficient cargo line and aggregate dock overflow reject the entire manifest', () => {
  const state = setup();
  for (const target of ['b3', 'b4'])
    rejects(
      state,
      command(target, [
        { item: 'vegetable', quantity: 4 },
        { item: 'wheat', quantity: 5 },
      ]),
      /仓库货物不足/,
    );
  state.commerce.dockCargo.b4.lettuce = 12;
  rejects(
    state,
    command('b4', [
      { item: 'vegetable', quantity: 4 },
      { item: 'wheat', quantity: 1 },
    ]),
    /船坞货区空间不足/,
  );
  state.commerce.dockCargo.b4.lettuce = COMMERCE.dockCapacity;
  rejects(state, command(), /船坞货区空间不足/);
});

test('empty, malformed, duplicate and untradable cargo cannot change stock or money', () => {
  const state = setup();
  for (const cargo of [
    [],
    null,
    undefined,
    {},
    [null],
    [[]],
    ['vegetable'],
    [{}],
    [
      { item: 'vegetable', quantity: 1 },
      { item: 'vegetable', quantity: 1 },
    ],
    [
      { item: 'vegetable', quantity: 1 },
      { item: 'mud', quantity: 1 },
    ],
    [{ item: 'treeSeed', quantity: 1 }],
    [{ item: '__proto__', quantity: 1 }],
    [{ item: 'constructor', quantity: 1 }],
  ])
    for (const target of ['b3', 'b4']) rejects(state, { ...command(target), cargo });
  for (const quantity of [0, -1, 0.5, NaN, Infinity, MAX_VALUE + 1, '1', null])
    for (const target of ['b3', 'b4'])
      rejects(state, command(target, [{ item: 'vegetable', quantity }]));
});

test('missing, stale or wrong source and destination facilities reject without side effects', () => {
  const state = setup();
  for (const buildingId of ['missing', 'b2', 'b3', 'b4'])
    rejects(state, { ...command(), buildingId });
  for (const targetId of ['missing', 'b1', 'b2']) rejects(state, command(targetId));
  state.buildings[0].kind = 'warehouse';
  rejects(state, command(), /请选择运输仓/);
  state.buildings[0].kind = 'transportWarehouse';
  delete state.commerce.shopStock.b3;
  rejects(state, command('b3'), /商店库存不存在/);
  delete state.commerce.dockCargo.b4;
  rejects(state, command('b4'), /船坞货区不存在/);
});

test('coin overflow keeps every cargo line while the exact monetary boundary succeeds', () => {
  const state = setup();
  const instruction = command('b3', [
    { item: 'vegetable', quantity: 4 },
    { item: 'wood', quantity: 1 },
  ]);
  const reward = 4 * COMMERCE.prices.vegetable.sell + COMMERCE.prices.wood.sell;
  state.coins = MAX_VALUE - reward + 1;
  rejects(state, instruction, /金币达到上限/);
  state.coins = MAX_VALUE - reward;
  transportDeliver(state, instruction);
  assert.equal(state.coins, MAX_VALUE);
});

test('a repeated emptied manifest cannot mint coins or duplicate cargo', () => {
  for (const target of ['b3', 'b4']) {
    const state = setup();
    const instruction = command(target, [{ item: 'vegetable', quantity: 7 }]);
    transportDeliver(state, instruction);
    rejects(state, instruction, /仓库货物不足/);
  }
});

test('staging while a voyage exists preserves its independent escrow and reward', () => {
  const state = setup();
  state.commerce.shipments.b4 = {
    id: 1,
    cargo: { ...emptyStock(), vegetable: 8 },
    reward: 8 * COMMERCE.prices.vegetable.ship,
    startedAt: 50,
    completeAt: 50 + COMMERCE.shippingDurationMs,
  };
  state.commerce.shipmentId = 2;
  const before = structuredClone(state.commerce.shipments);
  transportDeliver(state, command());
  assert.deepEqual(state.commerce.shipments, before);
  assert.equal(state.commerce.shipmentId, 2);
  assert.equal(state.commerce.dockCargo.b4.vegetable, 4);
});

test('dispatch-style cloning isolates source snapshots; unrelated ground and attached stock stay put', () => {
  const state = setup();
  state.groundStacks = [{ item: 'vegetable', amount: 4, x: 22, z: 22 }];
  state.fusion.attachments.b1 = { ...emptyStock(), vegetable: 2 };
  const original = structuredClone(state);
  const next = clone(state);
  transportDeliver(next, command());
  assert.deepEqual(state, original);
  assert.deepEqual(next.groundStacks, original.groundStacks);
  assert.deepEqual(next.fusion, original.fusion);
  assert.equal(next.inventory.vegetable, original.inventory.vegetable - 4);
});
