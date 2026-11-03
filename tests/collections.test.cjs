const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GameSession } = require('../.domain-build/application/GameSession.js');
const { collectionOrigin } = require('../.domain-build/application/Collections.js');
const { createDemoGame, CONFIG } = require('../.domain-build/domain/game.js');
const { farmCellCenter } = require('../.domain-build/application/FarmCells.js');
function fixture() {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
  const session = new GameSession(
    storage,
    () => 60000,
    () => createDemoGame(60000),
  );
  const events = [];
  session.setCollectionListener((event) => events.push(event));
  return { session, events };
}
test('successful harvest emits committed crop gain from the exact rotated cell only once', () => {
  const { session, events } = fixture();
  assert.ok(session.run({ type: 'rotateBuilding', buildingId: 'b2' }));
  assert.equal(events.length, 0);
  const farm = session.state.buildings.find((b) => b.id === 'b2'),
    crop = farm.cropJobs[0].crop;
  const center = farmCellCenter(farm, 0);
  assert.ok(session.run({ type: 'harvestCell', buildingId: 'b2', cell: 0 }));
  assert.deepEqual(events[0].gains, [{ kind: crop, amount: 2 }]);
  assert.deepEqual(collectionOrigin(events[0]), { ...center, y: 0.3 });
  assert.equal(session.run({ type: 'harvestCell', buildingId: 'b2', cell: 0 }), false);
  assert.equal(events.length, 1);
});
test('axe collection retains the removed tree as its source and does not animate spent durability', () => {
  const { session, events } = fixture(),
    tree = session.state.trees[0];
  assert.ok(session.run({ type: 'useTool', tool: 'axe', treeId: tree.id }));
  assert.deepEqual(events[0].gains, [{ kind: 'wood', amount: 1 }]);
  assert.deepEqual(collectionOrigin(events[0]), { x: tree.x + 0.5, y: 1, z: tree.z + 0.5 });
  assert.equal(
    session.state.trees.some((t) => t.id === tree.id),
    false,
  );
});
test('ground pickup and durable tool replenishment emit only their actual successful gains', () => {
  const { session, events } = fixture(),
    pile = session.state.groundStacks[0];
  assert.ok(session.run({ type: 'pickupProduct', item: pile.item, x: pile.x, z: pile.z }));
  assert.deepEqual(events[0].gains, [{ kind: pile.item, amount: 1 }]);
  assert.deepEqual(collectionOrigin(events[0]), { x: pile.x + 0.5, y: 0.4, z: pile.z + 0.5 });
  assert.ok(session.run({ type: 'buyTool', tool: 'axe' }));
  assert.deepEqual(events[1].gains, [{ kind: 'axe', amount: 10 }]);
  assert.equal(
    collectionOrigin(events[1]),
    null,
    'UI collection uses actual captured button location',
  );
});
test('moving a stack does not fabricate inventory collection', () => {
  const { session, events } = fixture(),
    pile = session.state.groundStacks[0];
  let command;
  for (let z = 0; z < CONFIG.gridSize && !command; z++)
    for (let x = 0; x < CONFIG.gridSize && !command; x++) {
      const candidate = { type: 'moveStack', fromX: pile.x, fromZ: pile.z, x, z };
      if ((x !== pile.x || z !== pile.z) && !session.reason(candidate)) command = candidate;
    }
  assert.ok(command);
  assert.ok(session.run(command));
  assert.equal(events.length, 0);
});
test('visual listener failure cannot undo or falsely reject committed gameplay', () => {
  const { session } = fixture(),
    before = session.state.inventory.vegetable;
  session.setCollectionListener(() => {
    throw Error('renderer unavailable');
  });
  assert.ok(session.run({ type: 'harvestCell', buildingId: 'b2', cell: 0 }));
  assert.equal(session.state.inventory.vegetable, before + 2);
});

test('whole-pile sidebar or warehouse recovery flies the actual quantity from its old location', () => {
  for (const warehouseDrop of [false, true]) {
    const { session, events } = fixture();
    const pile = session.state.groundStacks[0];
    const command = { type: 'pickupStack', x: pile.x, z: pile.z };
    if (warehouseDrop)
      command.warehouseId = session.state.buildings.find((b) => b.kind === 'expandedWarehouse').id;
    assert.ok(session.run(command));
    assert.deepEqual(events[0].gains, [{ kind: pile.item, amount: pile.amount }]);
    assert.deepEqual(collectionOrigin(events[0]), { x: pile.x + 0.5, y: 0.4, z: pile.z + 0.5 });
    assert.equal(session.run(command), false);
    assert.equal(events.length, 1);
  }
});
test('rejected full-storage pile recovery leaves source and emits no collection flight', () => {
  const { session, events } = fixture();
  const { getCapacity, getUsedStorage } = require('../.domain-build/domain/game.js');
  session.state.inventory.stone += getCapacity(session.state) - getUsedStorage(session.state);
  const pile = session.state.groundStacks[0],
    before = JSON.stringify(session.state);
  assert.equal(session.run({ type: 'pickupStack', x: pile.x, z: pile.z }), false);
  assert.equal(JSON.stringify(session.state), before);
  assert.equal(events.length, 0);
});
