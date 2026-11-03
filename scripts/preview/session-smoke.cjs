/** Actual profile/session integration; source-controlled demo initialization, real timers. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { collectionOrigin } = require('../../.domain-build/application/Collections.js');
const collectionEvents = [];
const listen = (session) => session.setCollectionListener((event) => collectionEvents.push(event));
const {
  townSession,
  profileStorage,
  activeProfile,
} = require('../../.domain-build/application/TownProfiles.js');
const { SAVE_KEY, GAME_SAVE_KEYS } = require('../../.domain-build/domain/storage.js');
const { isDockShore, DEMO_SEED } = require('../../.domain-build/domain/game.js');
const data = new Map();
const storage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
  removeItem: (key) => data.delete(key),
};
const open = (profile) => townSession(storage, profile, Date.now);
const saved = (profile) => profileStorage(storage, profile).getItem(SAVE_KEY);
function run(session, command) {
  assert.equal(session.run(command), true, session.message);
}
function reject(session, command) {
  const before = JSON.stringify(session.state);
  assert.equal(session.run(command), false);
  assert.equal(JSON.stringify(session.state), before, 'Rejected command is atomic');
}
async function waitUntil(time) {
  while (Date.now() <= time + 30)
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, time + 31 - Date.now())));
}
async function main() {
  const began = Date.now();
  // Explicit cleanup fixtures, not user browser storage and not injected gameplay inventory.
  for (const key of GAME_SAVE_KEYS) data.set(key, JSON.stringify({ schemaVersion: 7 }));
  data.set('other-app.notes', 'keep');
  assert.equal(activeProfile(storage), 'demo');
  let demo = open('demo');
  listen(demo);
  assert.equal(demo.state.schemaVersion, 8);
  assert.equal(demo.state.mapSeed, DEMO_SEED);
  for (const key of GAME_SAVE_KEYS) assert.equal(data.has(key), false);
  assert.equal(data.get('other-app.notes'), 'keep');
  let normal = open('normal');
  assert.equal(normal.state.coins, 120);
  assert.equal(normal.state.tools.sickle, 90);
  run(normal, { type: 'plantCell', buildingId: 'b2', cell: 0, crop: 'vegetable' });
  const normalGrowing = saved('normal');
  const normalReadyAt = normal.state.buildings.find((b) => b.id === 'b2').cropJobs[0].readyAt;
  const farm = demo.state.buildings.find((b) => b.id === 'b2');
  const board = demo.state.buildings.find((b) => b.kind === 'orderBoard');
  const shop = demo.state.buildings.find((b) => b.kind === 'shop');
  const dock = demo.state.buildings.find((b) => b.kind === 'dock');
  assert.ok(isDockShore(dock, demo.state.mapSeed), 'Actual generated natural shore');
  const originalJobs = JSON.parse(JSON.stringify(farm.cropJobs));
  const originalCoins = demo.state.coins;
  for (const rotation of [1, 2, 3, 0]) {
    run(demo, { type: 'rotateBuilding', buildingId: farm.id });
    const rotated = demo.state.buildings.find((b) => b.id === farm.id);
    assert.equal(rotated.rotation, rotation);
    assert.deepEqual(rotated.cropJobs, originalJobs);
  }
  assert.equal(demo.state.coins, originalCoins);
  assert.equal(collectionEvents.length, 0, 'Rotation does not fabricate gains');
  const movable = demo.state.groundStacks.find((pile) => pile.item === 'wood' && pile.amount === 3);
  let move;
  for (let z = 0; z < 24 && !move; z++)
    for (let x = 0; x < 24 && !move; x++) {
      const candidate = { type: 'moveStack', fromX: movable.x, fromZ: movable.z, x, z };
      if ((x !== movable.x || z !== movable.z) && !demo.reason(candidate)) move = candidate;
    }
  assert.ok(move, 'Actual natural map has legal stack relocation');
  run(demo, move);
  demo = open('demo');
  listen(demo);
  assert.ok(
    demo.state.groundStacks.some(
      (pile) => pile.x === move.x && pile.z === move.z && pile.amount === 3,
    ),
  );
  reject(demo, { type: 'moveStack', fromX: move.x, fromZ: move.z, x: 0, z: 0 });
  run(demo, { type: 'moveStack', fromX: move.x, fromZ: move.z, x: movable.x, z: movable.z });
  assert.equal(collectionEvents.length, 0, 'Stack relocation/rejection does not fabricate gains');
  for (let cell = 0; cell < 3; cell++)
    run(demo, { type: 'harvestCell', buildingId: farm.id, cell });
  assert.equal(collectionEvents.length, 3);
  assert.deepEqual(
    collectionEvents.map((event) => event.gains),
    ['vegetable', 'wheat', 'lettuce'].map((kind) => [{ kind, amount: 2 }]),
  );
  for (const event of collectionEvents) assert.ok(collectionOrigin(event));
  reject(demo, { type: 'harvestCell', buildingId: farm.id, cell: 3 });
  assert.equal(collectionEvents.length, 3, 'Failed harvest emits nothing');
  const order = {
    type: 'orderFulfill',
    buildingId: board.id,
    orderId: 'vegetable',
    offerId: demo.state.commerce.offerId,
  };
  run(demo, order);
  reject(demo, order);
  for (const item of ['vegetable', 'wheat', 'lettuce'])
    run(demo, { type: 'buyCrop', item, quantity: 1 });
  for (let cell = 6; cell < 9; cell++)
    run(demo, {
      type: 'plantCell',
      buildingId: farm.id,
      cell,
      crop: ['vegetable', 'wheat', 'lettuce'][cell - 6],
    });
  run(demo, { type: 'shopTrade', buildingId: shop.id, item: 'wheat', side: 'buy', quantity: 1 });
  run(demo, { type: 'shopTrade', buildingId: shop.id, item: 'wheat', side: 'sell', quantity: 1 });
  const beforeWood = demo.state.inventory.wood;
  const piles = demo.state.groundStacks.filter((p) => p.item === 'wood').map((p) => ({ ...p }));
  assert.deepEqual(piles.map((p) => p.amount).sort(), [3, 5]);
  for (const pile of piles) run(demo, { type: 'useTool', tool: 'saw', x: pile.x, z: pile.z });
  assert.equal(demo.state.inventory.wood, beforeWood + 2, 'Five-wood recipe returns two surplus');
  assert.equal(demo.state.tools.saw, 48);
  const tree = demo.state.trees[0];
  run(demo, { type: 'useTool', tool: 'axe', treeId: tree.id });
  reject(demo, { type: 'useTool', tool: 'axe', treeId: tree.id });
  assert.equal(demo.state.tools.axe, 49);
  const readyShipment = demo.state.commerce.shipments[dock.id];
  run(demo, { type: 'dockCollect', buildingId: dock.id, shipmentId: readyShipment.id });
  const shipmentId = demo.state.commerce.shipmentId;
  run(demo, { type: 'dockShip', buildingId: dock.id, shipmentId });
  const completeAt = demo.state.commerce.shipments[dock.id].completeAt;
  const collect = { type: 'dockCollect', buildingId: dock.id, shipmentId };
  reject(demo, collect);
  assert.equal(saved('normal'), normalGrowing, 'Demo actions cannot touch player save');
  const demoSaved = saved('demo');
  demo = open('demo');
  listen(demo);
  normal = open('normal');
  assert.equal(saved('demo'), demoSaved);
  assert.equal(demo.state.mapSeed, DEMO_SEED);
  assert.equal(demo.state.trees.length, 17);
  await waitUntil(Math.max(normalReadyAt, completeAt));
  run(normal, { type: 'harvestCell', buildingId: 'b2', cell: 0 });
  assert.equal(normal.state.inventory.vegetable, 2);
  assert.equal(normal.state.tools.sickle, 89);
  for (let cell = 3; cell < 9; cell++)
    run(demo, { type: 'harvestCell', buildingId: farm.id, cell });
  assert.equal(demo.state.tools.sickle, 81);
  run(demo, collect);
  reject(demo, collect);
  assert.equal(demo.state.coins, 1065);
  assert.equal(demo.state.completedOrders, 1);
  const beforeDemoReset = saved('demo');
  assert.equal(normal.reset(), true);
  assert.equal(saved('demo'), beforeDemoReset, 'Player reset leaves demonstration intact');
  const normalReset = saved('normal');
  const finalPlayable = {
    coins: demo.state.coins,
    tools: { ...demo.state.tools },
    trees: demo.state.trees.length,
    completedOrders: demo.state.completedOrders,
  };
  assert.equal(demo.reset(), true);
  assert.equal(saved('normal'), normalReset, 'Demonstration reset leaves player town intact');
  assert.equal(demo.state.mapSeed, DEMO_SEED);
  assert.equal(demo.state.coins, 1000);
  assert.equal(demo.state.trees.length, 18);
  assert.equal(data.get('other-app.notes'), 'keep');
  assert.ok(
    collectionEvents.some(
      (event) =>
        event.command.type === 'useTool' &&
        event.command.tool === 'axe' &&
        event.gains.some((gain) => gain.kind === 'wood' && gain.amount === 1),
    ),
  );
  assert.ok(
    collectionEvents.some(
      (event) =>
        event.command.type === 'useTool' &&
        event.command.tool === 'saw' &&
        event.gains.some((gain) => gain.kind === 'wood' && gain.amount === 2),
    ),
  );
  assert.equal(collectionEvents.filter((event) => event.command.type === 'harvestCell').length, 9);
  const stackRetrieval = require('./stack-session.cjs')();
  const evidence = {
    passed: true,
    schemaVersion: 8,
    layer: 'TownProfiles + GameSession + storage, not browser input/rendering',
    timers:
      'Real elapsed time, no clock advance or gameplay state injection; official demo fixture used',
    elapsedMs: Date.now() - began,
    checks: [
      'narrow old prototype-key cleanup fixture preserves unrelated data',
      'demo default and independent player save',
      'three crop mature/growing/empty cells and real production',
      'bulk order rejects stale replay',
      'direct crop purchases and shop trade',
      'real three/five wood saw recipes and surplus',
      'axe targets actual state tree and repeated action rejected',
      'natural shore dock and real30second shipment survives reload',
      '90durability: demo81/player89',
      'both profile resets isolated and demo seed repeatable',
      'four real farm rotations preserve jobs/economy',
      'stack movement and reload preserve quantities; water drop rejects',
      'collection events only follow committed gains and retain world origin',
    ],
    collectionEvents: collectionEvents.map((event) => ({
      command: event.command,
      gains: event.gains,
      origin: collectionOrigin(event),
    })),
    stackRetrieval,
    finalPlayable,
  };
  fs.mkdirSync('build', { recursive: true });
  fs.writeFileSync('build/session-smoke.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
