/** Real application commands through warehouse/product routing, not browser pointer events. */
const assert = require('node:assert/strict');
const { townSession } = require('../../.domain-build/application/TownProfiles.js');
const { stackDropCommand } = require('../../.domain-build/application/StackDrop.js');
const { collectionOrigin } = require('../../.domain-build/application/Collections.js');
const { getCapacity, getUsedStorage } = require('../../.domain-build/domain/game.js');
module.exports = function stacks() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  let session = townSession(storage, 'demo', Date.now);
  const farmBefore = JSON.stringify(session.state.buildings.filter((b) => b.kind === 'farm'));
  const events = [];
  const listen = () => session.setCollectionListener((event) => events.push(event));
  listen();
  const run = (command) => assert.equal(session.run(command), true, session.message);
  const piles = session.state.groundStacks.filter((pile) => pile.item === 'wood');
  const source = piles.find((pile) => pile.amount === 5),
    target = piles.find((pile) => pile.amount === 3);
  const originalInventory = session.state.inventory.wood;
  run(stackDropCommand(source, { kind: 'ground', x: target.x, z: target.z }));
  const amountAt = (point) =>
    session.state.groundStacks.find((pile) => pile.x === point.x && pile.z === point.z)?.amount ??
    0;
  assert.equal(amountAt(target), 5);
  assert.equal(amountAt(source), 3);
  assert.equal(session.state.inventory.wood, originalInventory);
  assert.equal(events.length, 0, 'Partial merge creates no collection gain');
  session = townSession(storage, 'demo', Date.now);
  listen();
  assert.equal(amountAt(target) + amountAt(source), 8, 'Overflow survives reload');
  const warehouse = session.state.buildings.find((b) => b.kind === 'expandedWarehouse');
  run(stackDropCommand(target, { kind: 'building', building: warehouse }));
  run(stackDropCommand(source, { kind: 'products' }));
  assert.equal(session.state.inventory.wood, originalInventory + 8);
  assert.equal(amountAt(target) + amountAt(source), 0);
  assert.deepEqual(
    events.map((event) => event.gains),
    [[{ kind: 'wood', amount: 5 }], [{ kind: 'wood', amount: 3 }]],
  );
  for (const event of events) assert.ok(collectionOrigin(event));
  run({ type: 'dropProduct', item: 'wood', quantity: 3, x: source.x, z: source.z });
  const room = getCapacity(session.state) - getUsedStorage(session.state);
  assert.ok(room > 0);
  run({ type: 'buyCrop', item: 'vegetable', quantity: room });
  const full = JSON.stringify(session.state),
    eventCount = events.length;
  assert.equal(session.run(stackDropCommand(source, { kind: 'products' })), false);
  assert.equal(JSON.stringify(session.state), full, 'Full capacity rejects whole pile atomically');
  assert.equal(events.length, eventCount, 'Rejected retrieval emits nothing');
  const shop = session.state.buildings.find((b) => b.kind === 'shop');
  run({ type: 'shopTrade', buildingId: shop.id, item: 'vegetable', side: 'sell', quantity: 3 });
  run(stackDropCommand(source, { kind: 'products' }));
  assert.equal(amountAt(source), 0);
  assert.equal(getUsedStorage(session.state), getCapacity(session.state));
  session = townSession(storage, 'demo', Date.now);
  assert.equal(
    JSON.stringify(session.state.buildings.filter((b) => b.kind === 'farm')),
    farmBefore,
    'Stack commands never mutate independent farm jobs',
  );
  return {
    passed: true,
    layer: 'GameSession and shared stack-drop command routing, not browser drag',
    checks: [
      '5 onto 3 merges 2 and leaves 3 at the source',
      'merge conservation across reload',
      'warehouse target retrieves all 5 units',
      'products target retrieves all 3 units',
      'full storage rejects whole pile without partial loss or events',
      'retrieval succeeds after freeing capacity',
      'independent farm jobs remain unchanged',
    ],
    collectionEvents: events.length,
  };
};
