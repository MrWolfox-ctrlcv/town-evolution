const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  dispatch,
  exportSave,
  importSave,
  getCapacity,
} = require('../.domain-build/domain/game.js');

function fixture() {
  const result = dispatch(createGame(0), { type: 'place', kind: 'cooler', x: 2, z: 5 }, 0);
  assert.equal(result.ok, true);
  result.state.inventory = {
    vegetable: 4,
    chilledVegetable: 2,
    wheat: 0,
    lettuce: 0,
    wood: 0,
    stone: 0,
  };
  return result.state;
}
function reject(state, command) {
  const snapshot = JSON.stringify(state);
  const result = dispatch(state, command, 10);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(JSON.stringify(state), snapshot);
  return result;
}

for (const [sourceId, targetId] of [
  ['b3', 'b1'],
  ['b1', 'b3'],
]) {
  test(`dragMerge ${sourceId} onto ${targetId} accepts distant pair and retains warehouse location`, () => {
    const state = fixture();
    const snapshot = JSON.stringify(state);
    const warehouse = { ...state.buildings.find((b) => b.id === 'b1') };
    const result = dispatch(state, { type: 'dragMerge', sourceId, targetId }, 10);
    assert.equal(result.ok, true, result.error);
    const next = result.state;
    assert.equal(JSON.stringify(state), snapshot);
    assert.deepEqual(
      next.buildings.find((b) => b.id === 'b1'),
      { ...warehouse, kind: 'coldWarehouse' },
    );
    assert.equal(
      next.buildings.some((b) => b.id === 'b3'),
      false,
    );
    assert.equal(next.buildings.length, state.buildings.length - 1);
    assert.equal(next.coins, state.coins - 20);
    assert.equal(next.nextId, state.nextId);
    assert.equal(next.lastSeenAt, 10);
    assert.deepEqual(next.inventory, state.inventory);
    assert.equal(getCapacity(next), getCapacity(state));
    assert.deepEqual(importSave(exportSave(next), 10), next);
    reject(next, { type: 'dragMerge', sourceId, targetId });
  });
}

test('dragMerge rejects incompatible, self, missing and upgraded inputs atomically', () => {
  const state = fixture();
  for (const [sourceId, targetId] of [
    ['b1', 'b2'],
    ['b2', 'b3'],
    ['b1', 'b1'],
    ['b3', 'b3'],
    ['missing', 'b1'],
    ['b3', 'missing'],
  ]) {
    reject(state, { type: 'dragMerge', sourceId, targetId });
  }
  const expanded = dispatch(
    state,
    { type: 'upgrade', buildingId: 'b1', target: 'expandedWarehouse' },
    0,
  );
  assert.equal(expanded.ok, true);
  reject(expanded.state, { type: 'dragMerge', sourceId: 'b3', targetId: 'b1' });
});

test('dragMerge insufficient funds keeps both buildings and all fields untouched', () => {
  const state = fixture();
  state.coins = 19;
  reject(state, { type: 'dragMerge', sourceId: 'b3', targetId: 'b1' });
});

test('dragMerge rejects busy warehouse or cooler without consuming either', () => {
  for (const busyId of ['b1', 'b3']) {
    const state = fixture();
    state.buildings.find((b) => b.id === busyId).job = { id: 'j4', startedAt: 0, readyAt: 10000 };
    reject(state, { type: 'dragMerge', sourceId: 'b1', targetId: 'b3' });
  }
});

test('combine retains its adjacency requirement while dragMerge can merge the same distant pair', () => {
  const state = fixture();
  reject(state, { type: 'combine', warehouseId: 'b1', coolerId: 'b3' });
  const result = dispatch(state, { type: 'dragMerge', sourceId: 'b3', targetId: 'b1' }, 10);
  assert.equal(result.ok, true, result.error);
});
