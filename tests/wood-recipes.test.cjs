const { hammerAssemblyCommand } = require('./helpers/hammer-assembly.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  createDemoGame,
  dispatch,
  exportSave,
  importSave,
  getCapacity,
  getUsedStorage,
  RECIPE_DEFINITIONS,
  canMergeBuildings,
  ITEM_KEYS,
} = require('../.domain-build/domain/game.js');
const { GameSession } = require('../.domain-build/application/GameSession.js');
const { withLegacyBuilding } = require('./helpers/legacy-town.cjs');
function town() {
  const state = createGame(100, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  return state;
}
function run(state, command) {
  const before = JSON.stringify(state);
  const result = dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, true, result.error);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(importSave(exportSave(result.state), state.lastSeenAt), result.state);
  return result.state;
}
function rejects(state, command) {
  const before = JSON.stringify(state);
  const result = dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(JSON.stringify(state), before);
}
function craft(state, amount, x, z, tool = 'hammer') {
  state = run(state, { type: 'dropProduct', item: 'wood', quantity: amount, x, z });
  return run(state, { type: 'useTool', tool, x, z });
}
function pair(addition) {
  let state = town();
  state.inventory.wood = 8;
  state = craft(state, 4, 8, 5, 'hammer');
  const houseId = state.buildings.at(-1).id;
  state = craft(state, addition === 'crate' ? 2 : 1, 11, 5);
  const additionId = state.buildings.at(-1).id;
  return { state, houseId, additionId };
}
test('specified wood counts and tools make distinct products and discover only their recipe', () => {
  for (const [tool, amount, kind, recipe] of [
    ['hammer', 1, 'orderBoard', 'build-order-board'],
    ['hammer', 2, 'crate', 'build-crate'],
    ['saw', 3, 'handcart', 'build-handcart'],
    ['saw', 4, 'boat', 'build-boat'],
    ['hammer', 3, 'woodenPier', 'build-wooden-pier'],
    ['hammer', 4, 'house', 'build-house'],
  ]) {
    let state = town();
    state.inventory.wood = amount;
    const coins = state.coins;
    state = craft(state, amount, 8, 5, tool);
    assert.equal(state.buildings.at(-1).kind, kind);
    assert.equal(state.inventory.wood, 0);
    assert.equal(state.groundStacks.length, 0);
    assert.equal(state.coins, coins);
    assert.equal(state.tools[tool], 10);
    assert.deepEqual(Object.keys(state.fusion.discoveries), [recipe]);
    rejects(state, { type: 'useTool', tool, x: 8, z: 5 });
  }
});
test('schema8 board and crate identities and discoveries survive the change from saw to hammer', () => {
  for (const [amount, kind, recipeId] of [
    [1, 'orderBoard', 'build-order-board'],
    [2, 'crate', 'build-crate'],
  ]) {
    let state = withLegacyBuilding(town(), { kind, x: 8, z: 5 });
    const original = { ...state.buildings.at(-1) };
    state.fusion.discoveries[recipeId] = { count: 3, firstDiscoveredAt: 25 };
    const raw = JSON.parse(exportSave(state));
    raw.schemaVersion = 8;
    for (const item of ['rice', 'sapling', 'milledRice', 'flour', 'bread', 'roastedCarrot'])
      delete raw.inventory[item];
    state = importSave(JSON.stringify(raw), 100);
    assert.deepEqual(state.buildings.at(-1), original);
    assert.deepEqual(state.fusion.discoveries[recipeId], { count: 3, firstDiscoveredAt: 25 });
    assert.equal(RECIPE_DEFINITIONS.find((recipe) => recipe.id === recipeId).tool, 'hammer');
    state.inventory.wood = amount;
    state = run(state, { type: 'dropProduct', item: 'wood', quantity: amount, x: 11, z: 5 });
    rejects(state, { type: 'useTool', tool: 'saw', x: 11, z: 5 });
    state = run(state, { type: 'useTool', tool: 'hammer', x: 11, z: 5 });
    assert.equal(state.buildings.at(-1).kind, kind);
    assert.deepEqual(
      state.buildings.find((building) => building.id === original.id),
      original,
    );
    assert.deepEqual(state.fusion.discoveries[recipeId], { count: 4, firstDiscoveredAt: 25 });
  }
});
test('both explicit hammer selection orders retain house identity, location and both mounted stocks without fees', () => {
  for (const [addition, resultKind] of [
    ['crate', 'warehouse'],
    ['orderBoard', 'shop'],
  ]) {
    for (const reverse of [false, true]) {
      let { state, houseId, additionId } = pair(addition);
      state.inventory.treeSeed = 2;
      state = run(state, {
        type: 'attachMaterial',
        buildingId: houseId,
        item: 'treeSeed',
        quantity: 2,
      });
      state = run(state, {
        type: 'attachMaterial',
        buildingId: additionId,
        item: 'wood',
        quantity: 1,
      });
      const house = { ...state.buildings.find((b) => b.id === houseId) };
      const coins = state.coins;
      const inventory = { ...state.inventory };
      const ids = reverse ? [houseId, additionId] : [additionId, houseId];
      rejects(state, { type: 'dragMerge', sourceId: ids[0], targetId: ids[1] });
      const command = hammerAssemblyCommand(state, ids);
      for (const changed of [{ x: 99 }, { z: 99 }, { kind: 'warehouse' }, { rotation: 3 }]) {
        rejects(state, {
          ...command,
          sources: [{ ...command.sources[0], ...changed }, command.sources[1]],
        });
      }
      rejects(state, { ...command, tool: 'saw' });
      state = run(state, command);
      assert.deepEqual(
        state.buildings.find((b) => b.id === houseId),
        { ...house, kind: resultKind },
      );
      assert.equal(
        state.buildings.some((b) => b.id === additionId),
        false,
      );
      assert.equal(state.fusion.attachments[houseId].treeSeed, 2);
      assert.equal(state.fusion.attachments[houseId].wood, 1);
      assert.equal(state.fusion.attachments[additionId], undefined);
      assert.equal(state.coins, coins);
      assert.deepEqual(state.inventory, inventory);
      assert.equal(state.fusion.discoveries[`build-${resultKind}`].count, 1);
      if (resultKind === 'warehouse') assert.equal(getCapacity(state), 32);
      else {
        assert.equal(state.commerce.shopStock[houseId].vegetable, 8);
        state = run(state, {
          type: 'shopTrade',
          buildingId: houseId,
          item: 'vegetable',
          side: 'buy',
          quantity: 1,
        });
        assert.equal(state.commerce.shopStock[houseId].vegetable, 7);
      }
      rejects(state, command);
    }
  }
});
test('failed and repeated merges preserve materials, counters and discoveries', () => {
  let { state, houseId, additionId } = pair('crate');
  state.inventory.treeSeed = 6;
  for (const buildingId of [houseId, additionId])
    state = run(state, { type: 'attachMaterial', buildingId, item: 'treeSeed', quantity: 3 });
  rejects(state, { type: 'dragMerge', sourceId: houseId, targetId: additionId });
  rejects(state, hammerAssemblyCommand(state, [houseId, additionId]));
  rejects(state, { type: 'dragMerge', sourceId: houseId, targetId: houseId });
  rejects(state, { type: 'dragMerge', sourceId: houseId, targetId: 'b2' });
  assert.equal(canMergeBuildings('house', 'crate'), false);
  assert.equal(canMergeBuildings('orderBoard', 'house'), false);
  assert.equal(canMergeBuildings('house', 'warehouse'), false);
});
test('axe commits both outputs together only with room for all four, including saved zero durability', () => {
  for (const free of [0, 1, 2, 3, 4]) {
    const state = createGame(100, 1, 1);
    state.tools.axe = 0;
    state.inventory.vegetable = getCapacity(state) - free;
    const command = { type: 'useTool', tool: 'axe', treeId: state.trees[0].id };
    if (free < 4) rejects(state, command);
    else {
      const result = run(state, command);
      assert.equal(result.inventory.wood, 2);
      assert.equal(result.inventory.treeSeed, 2);
      assert.equal(getUsedStorage(result), getCapacity(result));
      assert.equal(result.tools.axe, 0);
      rejects(result, command);
    }
  }
  const recipe = RECIPE_DEFINITIONS.find((recipe) => recipe.id === 'gather-wood');
  assert.equal(recipe.result.amount, 2);
  assert.deepEqual(recipe.byproducts, [{ kind: 'treeSeed', label: '树种', amount: 2 }]);
});
test('schema8 stocks gain zero tree seeds without reinterpreting old stock', () => {
  let state = createGame(60000, 1, 1);
  state = withLegacyBuilding(state, { kind: 'shop', x: 2, z: 5 });
  state = withLegacyBuilding(state, { kind: 'dock', x: 7, z: 18 });
  state.inventory.vegetable = 4;
  state = run(state, {
    type: 'dockTransfer',
    buildingId: 'b4',
    item: 'vegetable',
    quantity: 1,
    direction: 'stage',
  });
  state = run(state, { type: 'dockShip', buildingId: 'b4', shipmentId: 1 });
  state = run(state, {
    type: 'dockTransfer',
    buildingId: 'b4',
    item: 'vegetable',
    quantity: 1,
    direction: 'stage',
  });
  state.inventory.treeSeed = 0; // This fixture represents a save from before tree seeds existed.
  state.fusion.attachments.b1 = Object.fromEntries(
    ITEM_KEYS.map((item) => [item, item === 'wood' ? 1 : 0]),
  );
  const raw = JSON.parse(exportSave(state));
  raw.schemaVersion = 8;
  for (const item of ['rice', 'sapling', 'milledRice', 'flour', 'bread', 'roastedCarrot']) {
    delete raw.inventory[item];
    for (const group of [raw.commerce.shopStock, raw.commerce.dockCargo, raw.fusion.attachments])
      for (const stock of Object.values(group)) delete stock[item];
    for (const shipment of Object.values(raw.commerce.shipments)) delete shipment.cargo[item];
  }
  delete raw.inventory.treeSeed;
  for (const group of [raw.commerce.shopStock, raw.commerce.dockCargo, raw.fusion.attachments])
    for (const stock of Object.values(group)) delete stock.treeSeed;
  for (const shipment of Object.values(raw.commerce.shipments)) delete shipment.cargo.treeSeed;
  assert.deepEqual(importSave(JSON.stringify(raw), 60000), state);
  for (const bad of [-1, 0.5, null, '2']) {
    raw.inventory.treeSeed = bad;
    assert.throws(() => importSave(JSON.stringify(raw), 60000));
  }
});
test('schema10 does not treat missing tree seeds as an old-schema default', () => {
  const state = createGame(100);
  const raw = JSON.parse(exportSave(state));
  delete raw.inventory.treeSeed;
  assert.throws(() => importSave(JSON.stringify(raw), 100));
});
test('tree seeds keep their identity in storage but cannot be assigned an invented sale or shipment value', () => {
  let state = createDemoGame(60000);
  state.inventory.treeSeed = 2;
  const shop = state.buildings.find((b) => b.kind === 'shop').id;
  const board = state.buildings.find((b) => b.kind === 'orderBoard').id;
  const dock = state.buildings.find((b) => b.kind === 'dock').id;
  for (const side of ['buy', 'sell'])
    rejects(state, { type: 'shopTrade', buildingId: shop, item: 'treeSeed', quantity: 1, side });
  rejects(state, {
    type: 'dockTransfer',
    buildingId: dock,
    item: 'treeSeed',
    quantity: 1,
    direction: 'stage',
  });
  rejects(state, {
    type: 'orderFulfill',
    buildingId: board,
    orderId: 'treeSeed',
    offerId: state.commerce.offerId,
  });
  assert.equal(state.inventory.treeSeed, 2);
});
test('repeated recipe previews never mutate the live session or record discoveries', () => {
  const { state, houseId, additionId } = pair('crate');
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const session = new GameSession(
    storage,
    () => 100,
    () => state,
  );
  const before = exportSave(session.state);
  const command = hammerAssemblyCommand(state, [additionId, houseId]);
  assert.notEqual(
    session.reason({ type: 'dragMerge', sourceId: additionId, targetId: houseId }),
    null,
  );
  for (let i = 0; i < 10; i++) assert.equal(session.reason(command), null);
  assert.equal(exportSave(session.state), before);
  assert.equal(values.size, 0);
  assert.equal(session.run(command), true);
  assert.equal(session.state.fusion.discoveries['build-warehouse'].count, 1);
  assert.equal(session.run(command), false);
});
