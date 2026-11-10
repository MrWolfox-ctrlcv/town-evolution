const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { hasPlantingSource } = require('../.domain-build/domain/planting');
const { GameSession } = require('../.domain-build/application/GameSession');
const { load } = require('./helpers/selection-ui.cjs');
const { actions } = load('HudActions');
const { productionActions } = load('RouteActions');
const { createUiState } = load('UiContracts');

function fixture(item, amount) {
  const state = g.createGame(1000, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.buildings.push({ id: 'b3', kind: 'crate', x: 9, z: 5, rotation: 0 });
  state.nextId = 4;
  state.inventory = { ...emptyStock(), [item]: amount };
  state.coins = 0;
  const values = new Map();
  const session = new GameSession(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    () => 1000,
    () => state,
  );
  assert.equal(session.run({ type: 'useTool', tool: 'hammer', buildingId: 'b3' }), true);
  assert.equal(
    session.run({
      type: 'depositCompost',
      buildingId: 'b3',
      quantity: amount,
      source: { type: 'inventory', item, amount },
    }),
    true,
  );
  return { session, values, barrel: () => session.state.buildings.find((b) => b.id === 'b3') };
}

function roundtrip(state) {
  const loaded = g.importSave(g.exportSave(state), state.lastSeenAt);
  assert.deepEqual(loaded, state);
  return loaded;
}

for (const item of ['vegetable', 'wheat', 'lettuce', 'rice']) {
  for (const amount of [1, 3]) {
    test(`${item}: waiting crop blocks recovery with ${amount === 1 ? 'idle' : 'working'} barrel`, () => {
      const { session, values, barrel } = fixture(item, amount);
      assert.equal(barrel().compost.stock[item], 1);
      assert.equal(barrel().compost.job?.inputs[0].amount ?? 0, amount - 1);
      assert.equal(
        session.reason({ type: 'withdrawCompostInput', buildingId: 'b3', item, quantity: 1 }),
        null,
      );
      assert.equal(hasPlantingSource(roundtrip(session.state)), true);
      const before = session.state;
      const raw = [...values.entries()];
      assert.equal(session.run({ type: 'recoverCrop' }), false);
      assert.equal(session.state, before);
      assert.equal(session.state.cropRecoveryAvailable, true);
      assert.deepEqual([...values.entries()], raw);
      roundtrip(session.state);
    });
  }
}

test('HUD disables emergency recovery while barrel withdrawal stays available', () => {
  const { session, barrel } = fixture('vegetable', 1);
  const ui = createUiState();
  ui.cropShopOpen = true;
  const handlers = { command: (command) => session.run(command), quantity() {}, cancel() {} };
  const emergency = actions(session, ui, handlers).find((action) => action.text === '应急种苗');
  assert.equal(emergency.enabled, false);
  const withdraw = productionActions(session, barrel(), handlers, ui).find((action) =>
    action.text.includes('待加工胡萝卜'),
  );
  assert.equal(withdraw.enabled, true);
  withdraw.run();
  assert.equal(session.state.inventory.vegetable, 1);
  assert.equal(session.state.cropRecoveryAvailable, true);
  assert.equal(session.reason({ type: 'recoverCrop' }) !== null, true);
  roundtrip(session.state);
});

test('reserved-only crop inputs do not block legitimate one-time recovery', () => {
  const { session, values, barrel } = fixture('vegetable', 2);
  assert.equal(barrel().compost.stock.vegetable, 0);
  assert.equal(barrel().compost.job.inputs[0].amount, 2);
  const reserved = JSON.stringify(barrel().compost.job);
  assert.notEqual(
    session.reason({
      type: 'withdrawCompostInput',
      buildingId: 'b3',
      item: 'vegetable',
      quantity: 1,
    }),
    null,
  );
  assert.equal(hasPlantingSource(session.state), false);
  const raw = [...values.entries()];
  assert.equal(session.run({ type: 'recoverCrop' }), true);
  assert.notDeepEqual([...values.entries()], raw);
  assert.equal(session.state.inventory.vegetable, 1);
  assert.equal(roundtrip(session.state).cropRecoveryAvailable, false);
  assert.equal(JSON.stringify(barrel().compost.job), reserved);
  const after = [...values.entries()];
  assert.equal(session.run({ type: 'recoverCrop' }), false);
  assert.deepEqual([...values.entries()], after);
});

test('waiting tree seeds and fertilizer do not count as crop planting sources', () => {
  const { session, barrel } = fixture('treeSeed', 1);
  assert.equal(barrel().compost.stock.treeSeed, 1);
  assert.ok(session.state.tools.fertilizer > 0);
  assert.equal(hasPlantingSource(roundtrip(session.state)), false);
  assert.equal(session.run({ type: 'recoverCrop' }), true);
  assert.equal(session.state.inventory.vegetable, 1);
  assert.equal(roundtrip(session.state).cropRecoveryAvailable, false);
});
