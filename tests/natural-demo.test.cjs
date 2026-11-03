const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createDemoGame,
  DEMO_SEED,
  dispatch,
  exportSave,
  importSave,
  isDockShore,
  getCapacity,
} = require('../.domain-build/domain/game.js');
const NOW = 100000;
function run(s, c, t = s.lastSeenAt) {
  const r = dispatch(s, c, t);
  assert.equal(r.ok, true, r.error);
  return importSave(exportSave(r.state), r.state.lastSeenAt);
}
test('demo is one deterministic actual game fixture with all currently supported features', () => {
  const s = createDemoGame(NOW);
  assert.equal(s.mapSeed, DEMO_SEED);
  assert.deepEqual(createDemoGame(NOW), s);
  assert.deepEqual(importSave(exportSave(s), NOW), s);
  for (const kind of ['farm', 'expandedWarehouse', 'warehouse', 'shop', 'orderBoard', 'dock'])
    assert.ok(
      s.buildings.some((b) => b.kind === kind),
      kind,
    );
  const farm = s.buildings.find((b) => b.id === 'b2');
  assert.equal(farm.cropJobs.filter((j) => j && j.readyAt <= NOW).length, 3);
  assert.equal(farm.cropJobs.filter((j) => j && j.readyAt > NOW).length, 3);
  assert.equal(farm.cropJobs.filter((j) => !j).length, 3);
  assert.deepEqual(
    farm.cropJobs.slice(0, 3).map((j) => j.crop),
    ['vegetable', 'wheat', 'lettuce'],
  );
  assert.equal(s.trees.length, 18);
  assert.ok(s.groundStacks.some((p) => p.item === 'wood' && p.amount === 3));
  assert.ok(s.groundStacks.some((p) => p.item === 'wood' && p.amount === 5));
  const dock = s.buildings.find((b) => b.kind === 'dock');
  assert.ok(isDockShore(dock, s.mapSeed));
  assert.ok(s.commerce.shipments[dock.id]);
  assert.equal(s.coins, 1000);
});
test('demo saw recipes really build warehouses and surplus returns without hidden setup mutations', () => {
  let s = createDemoGame(NOW);
  const capacity = getCapacity(s),
    coins = s.coins,
    wood = s.inventory.wood;
  for (const pile of [...s.groundStacks])
    s = run(s, { type: 'useTool', tool: 'saw', x: pile.x, z: pile.z });
  assert.equal(getCapacity(s), capacity + 32);
  assert.equal(s.inventory.wood, wood + 2);
  assert.equal(s.coins, coins);
  assert.equal(s.tools.saw, 48);
  assert.equal(s.groundStacks.length, 0);
});
test('demo supports real crop harvest/plant, axe, sale, purchase, ready settlement and next shipment', () => {
  let s = createDemoGame(NOW);
  const shop = s.buildings.find((b) => b.kind === 'shop').id,
    dock = s.buildings.find((b) => b.kind === 'dock').id;
  for (let cell = 0; cell < 3; cell++) s = run(s, { type: 'harvestCell', buildingId: 'b2', cell });
  assert.equal(s.tools.sickle, 87);
  s = run(s, { type: 'plantCell', buildingId: 'b2', cell: 6, crop: 'lettuce' });
  s = run(s, { type: 'useTool', tool: 'axe', treeId: s.trees[0].id });
  s = run(s, { type: 'shopTrade', buildingId: shop, item: 'wood', quantity: 1, side: 'sell' });
  s = run(s, { type: 'buyCrop', item: 'wheat', quantity: 1 });
  s = run(s, { type: 'dockCollect', buildingId: dock, shipmentId: s.commerce.shipments[dock].id });
  s = run(s, { type: 'dockShip', buildingId: dock, shipmentId: s.commerce.shipmentId });
  s = run(
    s,
    { type: 'dockCollect', buildingId: dock, shipmentId: s.commerce.shipments[dock].id },
    NOW + 30000,
  );
  assert.equal(s.commerce.shipments[dock], undefined);
  assert.equal(s.buildings.find((b) => b.id === 'b2').cropJobs[6].crop, 'lettuce');
});
test('saved demo progress is preserved, while explicit fixture reset is repeatable and independent', () => {
  const fresh = createDemoGame(NOW);
  let changed = run(fresh, { type: 'useTool', tool: 'axe', treeId: fresh.trees[0].id });
  assert.equal(changed.trees.length, 17);
  changed = importSave(exportSave(changed), NOW + 999);
  assert.equal(changed.trees.length, 17);
  const reset = createDemoGame(NOW);
  assert.equal(reset.trees.length, 18);
  assert.deepEqual(reset, fresh);
  assert.notDeepEqual(changed, reset);
});
test('demo valid timestamps also support time-zero automated fixtures without negative jobs', () => {
  const s = createDemoGame(0);
  assert.deepEqual(importSave(exportSave(s), 0), s);
  assert.ok(
    s.buildings
      .find((b) => b.id === 'b2')
      .cropJobs.filter(Boolean)
      .every((j) => j.startedAt >= 0),
  );
});
test('a fresh demonstration can immediately fulfill a real bulk order', () => {
  const before = createDemoGame(NOW),
    board = before.buildings.find((b) => b.kind === 'orderBoard');
  assert.equal(before.inventory.vegetable, 8);
  const after = run(before, {
    type: 'orderFulfill',
    buildingId: board.id,
    orderId: 'vegetable',
    offerId: before.commerce.offerId,
  });
  assert.equal(after.inventory.vegetable, 0);
  assert.equal(after.coins, before.coins + 56);
  assert.equal(after.completedOrders, 1);
});
