const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  dispatch,
  importSave,
  exportSave,
  stackLimitFor,
  ITEM_KEYS,
} = require('../.domain-build/domain/game.js');
function town() {
  const state = createGame(0, 1, 1);
  state.trees = [];
  return state;
}
test('ground limits distinguish ten crops, six wood and stone, nine mud and five other goods', () => {
  assert.equal(stackLimitFor('wood'), 6);
  assert.equal(stackLimitFor('stone'), 6);
  assert.equal(stackLimitFor('soil'), 5);
  assert.equal(stackLimitFor('mud'), 9);
  for (const item of ['vegetable', 'wheat', 'lettuce']) assert.equal(stackLimitFor(item), 10);
  for (const item of ['treeSeed', 'chilledVegetable']) assert.equal(stackLimitFor(item), 5);
});
test('every active item accepts exactly its limit and rejects overflow without changing stock', () => {
  for (const item of ITEM_KEYS) {
    const state = town();
    const limit = stackLimitFor(item);
    state.inventory[item] = limit + 1;
    const result = dispatch(state, { type: 'dropProduct', item, x: 8, z: 5, quantity: limit }, 0);
    assert.equal(result.ok, true, `${item}: ${result.error}`);
    assert.equal(result.state.groundStacks[0].amount, limit);
    const overflow = dispatch(result.state, { type: 'dropProduct', item, x: 8, z: 5 }, 0);
    assert.equal(overflow.ok, false);
    assert.equal(overflow.state, result.state);
    assert.equal(result.state.inventory[item], 1);
    assert.deepEqual(importSave(exportSave(result.state), 0), result.state);
    const invalid = structuredClone(result.state);
    invalid.groundStacks[0].amount = limit + 1;
    assert.throws(() => importSave(JSON.stringify(invalid), 0));
  }
});
test('partial wood merges fill six and preserve surplus; attachment capacity remains five', () => {
  const state = town();
  state.groundStacks = [
    { x: 8, z: 5, item: 'wood', amount: 4 },
    { x: 11, z: 5, item: 'wood', amount: 4 },
  ];
  const result = dispatch(state, { type: 'moveStack', fromX: 8, fromZ: 5, x: 11, z: 5 }, 0);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(
    result.state.groundStacks.map((p) => p.amount),
    [2, 6],
  );
  assert.deepEqual(
    state.groundStacks.map((p) => p.amount),
    [4, 4],
  );
  assert.deepEqual(importSave(exportSave(result.state), 0), result.state);
  state.inventory.wood = 6;
  const attached = dispatch(
    state,
    { type: 'attachMaterial', buildingId: 'b1', item: 'wood', quantity: 6 },
    0,
  );
  assert.equal(attached.ok, false);
  assert.equal(attached.state, state);
});
