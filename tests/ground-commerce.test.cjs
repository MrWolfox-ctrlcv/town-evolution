/** Domain and application regression tests, not a rendered Cocos/device test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../.domain-build/domain/game.js');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
const { MAX_VALUE } = require('../.domain-build/domain/config.js');
const {
  stackDropCommand,
  stackDropHint,
  stackDropMarker,
} = require('../.domain-build/application/StackDrop.js');
const baseline = game.createDemoGame(60000);
function fixture(item = 'vegetable') {
  const state = structuredClone(baseline);
  const pile = state.groundStacks.find((p) => p.item === item);
  assert.ok(pile);
  state.inventory = { ...emptyStock(), vegetable: game.getCapacity(state) };
  const shop = state.buildings.find((b) => b.kind === 'shop');
  const dock = state.buildings.find((b) => b.kind === 'dock');
  state.commerce.dockCargo[dock.id] = emptyStock();
  delete state.commerce.shipments[dock.id];
  return { state, pile, shop, dock };
}
function run(state, command) {
  const before = game.exportSave(state);
  const result = game.dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, true, result.error);
  assert.equal(game.exportSave(state), before, 'Original snapshot stays unchanged');
  return result.state;
}
function rejects(state, command) {
  const before = game.exportSave(state);
  const result = game.dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(game.exportSave(state), before);
}
function routed(f, building) {
  return stackDropCommand(f.pile, { kind: 'building', building }, f.state);
}
for (const crop of game.CROP_KEYS) {
  test(`${crop} ground stack sells atomically at the existing price without warehouse headroom`, () => {
    const f = fixture(crop);
    const command = routed(f, f.shop);
    assert.deepEqual(command, {
      type: 'shopTrade',
      buildingId: f.shop.id,
      item: crop,
      quantity: 10,
      side: 'sell',
      source: { x: f.pile.x, z: f.pile.z },
    });
    assert.equal(
      stackDropHint(f.state, command),
      `松手卖10份 · +${10 * game.COMMERCE.prices[crop].sell}币`,
    );
    assert.ok(stackDropMarker(f.state, command));
    const after = run(f.state, command);
    assert.equal(after.coins, f.state.coins + 10 * game.COMMERCE.prices[crop].sell);
    assert.deepEqual(after.inventory, f.state.inventory);
    assert.equal(after.groundStacks.length, f.state.groundStacks.length - 1);
    assert.deepEqual(after.commerce, f.state.commerce);
    assert.deepEqual(game.importSave(game.exportSave(after), after.lastSeenAt), after);
    rejects(after, command);
  });
  test(`${crop} ground stack stages at dock without selling or automatically sailing`, () => {
    const f = fixture(crop);
    const command = routed(f, f.dock);
    assert.deepEqual(command, {
      type: 'dockTransfer',
      buildingId: f.dock.id,
      item: crop,
      quantity: 10,
      direction: 'stage',
      source: { x: f.pile.x, z: f.pile.z },
    });
    assert.equal(stackDropHint(f.state, command), '松手装货10份 · 不会卖出');
    const marker = stackDropMarker(f.state, command);
    const size = game.footprint(f.dock);
    assert.deepEqual(marker, {
      x: f.dock.x + size.width / 2,
      z: f.dock.z + size.depth / 2,
      ...size,
    });
    const after = run(f.state, command);
    assert.equal(after.coins, f.state.coins);
    assert.deepEqual(after.inventory, f.state.inventory);
    assert.equal(after.commerce.dockCargo[f.dock.id][crop], 10);
    assert.equal(after.commerce.shipments[f.dock.id], undefined);
    assert.deepEqual(game.importSave(game.exportSave(after), after.lastSeenAt), after);
    rejects(after, command);
  });
}
for (const item of ['milledRice', 'flour', 'bread']) {
  test(`${item} ground goods sell or stage whole without warehouse space, replay or silent conversion`, () => {
    const f = fixture();
    f.pile.item = item;
    f.pile.amount = 2;
    for (const building of [f.shop, f.dock]) {
      const command = routed(f, building);
      assert.ok(command);
      assert.equal(command.item, item);
      assert.equal(command.quantity, 2);
      assert.deepEqual(command.source, { x: f.pile.x, z: f.pile.z });
      const after = run(f.state, command);
      assert.deepEqual(after.inventory, f.state.inventory);
      assert.equal(after.groundStacks.length, f.state.groundStacks.length - 1);
      assert.equal(
        after.groundStacks.some((p) => p.x === f.pile.x && p.z === f.pile.z),
        false,
      );
      if (building === f.shop) {
        assert.equal(after.coins, f.state.coins + 2 * game.COMMERCE.prices[item].sell);
        assert.deepEqual(after.commerce, f.state.commerce);
      } else {
        assert.equal(after.coins, f.state.coins);
        assert.equal(after.commerce.dockCargo[f.dock.id][item], 2);
        assert.equal(after.commerce.shipments[f.dock.id], undefined);
      }
      assert.deepEqual(game.importSave(game.exportSave(after), after.lastSeenAt), after);
      rejects(after, command);
      for (const quantity of [0, 1, 3]) rejects(f.state, { ...command, quantity });
    }
    rejects({ ...f.state, coins: MAX_VALUE }, routed(f, f.shop));
    f.state.commerce.dockCargo[f.dock.id].wheat = game.COMMERCE.dockCapacity - 1;
    rejects(f.state, routed(f, f.dock));
  });
}
test('full or nearly full dock keeps the entire pile and existing cargo unchanged', () => {
  const f = fixture();
  for (const amount of [7, game.COMMERCE.dockCapacity]) {
    f.state.commerce.dockCargo[f.dock.id].wheat = amount;
    rejects(f.state, routed(f, f.dock));
  }
  f.state.commerce.dockCargo[f.dock.id].wheat = 6;
  const after = run(f.state, routed(f, f.dock));
  assert.equal(after.commerce.dockCargo[f.dock.id].vegetable, 10);
  assert.equal(after.commerce.dockCargo[f.dock.id].wheat, 6);
});
test('coin overflow, stale quantity/item, missing source and malformed sources preserve both stocks', () => {
  const f = fixture();
  const sale = routed(f, f.shop),
    stage = routed(f, f.dock);
  assert.ok(sale && stage);
  rejects({ ...f.state, coins: MAX_VALUE }, sale);
  for (const command of [sale, stage]) {
    for (const source of [
      null,
      {},
      { x: -1, z: 3 },
      { x: 0.5, z: 3 },
      { x: Infinity, z: 3 },
      { x: 192, z: 3 },
      { x: 0, z: 0 },
    ])
      rejects(f.state, { ...command, source });
    for (const quantity of [0, 1, 9, 11, NaN, Infinity]) rejects(f.state, { ...command, quantity });
    rejects(f.state, { ...command, item: 'wheat' });
    rejects(f.state, { ...command, buildingId: 'missing' });
    rejects(f.state, { ...command, buildingId: f.state.buildings[0].id });
  }
  rejects(f.state, { ...sale, side: 'buy' });
  rejects(f.state, { ...stage, direction: 'return' });
});
test('unsupported ground materials remain unavailable for shop/dock drops without changing existing inventory trades', () => {
  for (const item of ['wood', 'stone', 'soil', 'treeSeed', 'mud', 'sapling', 'chilledVegetable']) {
    const f = fixture();
    f.pile.item = item;
    f.pile.amount = 1;
    for (const building of [f.shop, f.dock]) assert.equal(routed(f, building), null);
    for (const command of [
      { type: 'shopTrade', buildingId: f.shop.id, side: 'sell' },
      { type: 'dockTransfer', buildingId: f.dock.id, direction: 'stage' },
    ])
      rejects(f.state, { ...command, item, quantity: 1, source: { x: f.pile.x, z: f.pile.z } });
  }
});
test('inventory sale and staging still consume only inventory and leave identical ground crops alone', () => {
  const f = fixture();
  const sale = { ...routed(f, f.shop) };
  const stage = { ...routed(f, f.dock) };
  delete sale.source;
  delete stage.source;
  for (const command of [sale, stage]) {
    const after = run(f.state, command);
    assert.equal(after.inventory.vegetable, f.state.inventory.vegetable - 10);
    assert.deepEqual(after.groundStacks, f.state.groundStacks);
  }
});
