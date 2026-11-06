const { test } = require('node:test');
const assert = require('node:assert/strict');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
const { withLegacyBuilding } = require('./helpers/legacy-town.cjs');
const { createGame, dispatch } = require('../.domain-build/domain/game.js');
const {
  tradeQuantity,
  nextQuantity,
  stockDropCommand,
} = require('../.domain-build/application/CommerceSelection.js');
function facilities() {
  let state = createGame(0, 1, 1);
  for (const [kind, x, z] of [
    ['shop', 2, 5],
    ['dock', 7, 18],
  ])
    state = withLegacyBuilding(state, { kind, x, z });
  return state;
}
test('quantity selector cycles explicit 1,4,all and uses correct inventory source', () => {
  const state = facilities();
  const shop = state.buildings.find((b) => b.kind === 'shop').id;
  state.inventory.vegetable = 3;
  assert.equal(nextQuantity(1), 4);
  assert.equal(nextQuantity(4), 'all');
  assert.equal(nextQuantity('all'), 1);
  assert.equal(tradeQuantity(state, shop, 'vegetable', 1, 'inventory'), 1);
  assert.equal(tradeQuantity(state, shop, 'vegetable', 4, 'inventory'), 4);
  assert.equal(tradeQuantity(state, shop, 'vegetable', 'all', 'inventory'), 3);
  assert.equal(tradeQuantity(state, shop, 'vegetable', 'all', 'shop'), 8);
});
test('inventory drop sells exactly1 at shop; dock stages1 without reward', () => {
  const state = facilities();
  state.inventory.vegetable = 4;
  const shop = state.buildings.find((b) => b.kind === 'shop').id;
  const dock = state.buildings.find((b) => b.kind === 'dock').id;
  const sold = dispatch(state, stockDropCommand(state, 'vegetable', shop), 1);
  assert.ok(sold.ok);
  assert.equal(sold.state.inventory.vegetable, 3);
  assert.equal(sold.state.coins, state.coins + 5);
  const staged = dispatch(state, stockDropCommand(state, 'vegetable', dock), 1);
  assert.ok(staged.ok);
  assert.equal(staged.state.inventory.vegetable, 3);
  assert.equal(staged.state.coins, state.coins);
  assert.equal(staged.state.commerce.dockCargo[dock].vegetable, 1);
  assert.equal(stockDropCommand(state, 'vegetable', 'b2'), null);
  assert.equal(stockDropCommand(state, 'chilledVegetable', 'b2'), null);
  assert.equal(stockDropCommand(state, 'vegetable', null), null);
});

test('legacy cold clearance appears only when actual player goods remain', () => {
  const { tradeItems } = require('../.domain-build/application/CommerceSelection.js');
  const state = createGame(0, 1, 1);
  assert.deepEqual(tradeItems(state), ['vegetable', 'wheat', 'lettuce', 'rice']);
  state.inventory.chilledVegetable = 1;
  assert.ok(tradeItems(state).includes('chilledVegetable'));
  state.inventory.chilledVegetable = 0;
  state.commerce.dockCargo.old = { ...emptyStock(), chilledVegetable: 2 };
  assert.ok(tradeItems(state).includes('chilledVegetable'));
});

test('owned materials and processed goods appear in trading choices without exposing non-tradable items', () => {
  const { tradeItems } = require('../.domain-build/application/CommerceSelection.js');
  for (const item of ['wood', 'stone', 'soil', 'milledRice', 'flour', 'bread'])
    for (const owner of ['inventory', 'dockCargo', 'shipments']) {
      const state = createGame(0, 1, 1);
      assert.equal(tradeItems(state).includes(item), false);
      const stock = { ...emptyStock(), [item]: 2 };
      if (owner === 'inventory') state.inventory = stock;
      else if (owner === 'dockCargo') state.commerce.dockCargo.old = stock;
      else state.commerce.shipments.old = { cargo: stock };
      const snapshot = JSON.stringify(state);
      assert.equal(tradeItems(state).includes(item), true);
      assert.equal(JSON.stringify(state), snapshot, 'Reading choices never mutates stock');
      stock[item] = 0;
      assert.equal(tradeItems(state).includes(item), false);
    }
  const state = createGame(0, 1, 1);
  for (const item of ['sapling', 'treeSeed', 'mud']) state.inventory[item] = 2;
  assert.deepEqual(tradeItems(state), ['vegetable', 'wheat', 'lettuce', 'rice']);
});
