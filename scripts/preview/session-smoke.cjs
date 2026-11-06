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
const {
  isDockShore,
  DEMO_SEED,
  dropPosition,
  cropDropAnchor,
} = require('../../.domain-build/domain/game.js');
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
  const before = JSON.stringify(session.state),
    bytes = [...data],
    events = collectionEvents.length;
  assert.equal(session.run(command), false);
  assert.equal(JSON.stringify(session.state), before, 'Rejected command is atomic');
  assert.deepEqual([...data], bytes, 'Rejected command never writes a save');
  assert.equal(collectionEvents.length, events, 'Rejected command never emits a collection');
}
async function waitUntil(time) {
  while (Date.now() <= time + 30)
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, time + 31 - Date.now())));
}
async function main() {
  const began = Date.now();
  // Unsupported-save fixtures are preserved until an explicit synthetic reset. No user browser storage is read.
  for (const key of GAME_SAVE_KEYS) data.set(key, JSON.stringify({ schemaVersion: 7 }));
  data.set('other-app.notes', 'keep');
  assert.equal(activeProfile(storage), 'demo');
  let demo = open('demo');
  listen(demo);
  assert.equal(demo.state.schemaVersion, 10);
  assert.equal(demo.state.mapSeed, DEMO_SEED);
  for (const key of GAME_SAVE_KEYS)
    assert.equal(data.get(key), JSON.stringify({ schemaVersion: 7 }));
  assert.equal(data.get('other-app.notes'), 'keep');
  let normal = open('normal');
  assert.equal(normal.mode, 'corrupt');
  for (const key of GAME_SAVE_KEYS)
    assert.equal(data.get(key), JSON.stringify({ schemaVersion: 7 }));
  assert.equal(
    normal.reset(),
    true,
    'Explicit test reset is required before replacing the unsupported primary',
  );
  assert.equal(data.get(`${SAVE_KEY}.before-reset`), JSON.stringify({ schemaVersion: 7 }));
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
  const movable = demo.state.groundStacks.find((pile) => pile.item === 'wood' && pile.amount === 4);
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
      (pile) => pile.x === move.x && pile.z === move.z && pile.amount === 4,
    ),
  );
  reject(demo, { type: 'moveStack', fromX: move.x, fromZ: move.z, x: 0, z: 0 });
  run(demo, { type: 'moveStack', fromX: move.x, fromZ: move.z, x: movable.x, z: movable.z });
  assert.equal(collectionEvents.length, 0, 'Stack relocation/rejection does not fabricate gains');
  const inventoryBeforeHarvest = { ...demo.state.inventory };
  const untouchedDrops = structuredClone(demo.state.looseDrops);
  for (let cell = 0; cell < 3; cell++)
    run(demo, { type: 'harvestCell', buildingId: farm.id, cell });
  assert.deepEqual(demo.state.inventory, inventoryBeforeHarvest);
  assert.equal(collectionEvents.length, 0, 'Cutting crops drops goods without inventory flights');
  const firstHarvestDrops = demo.state.looseDrops.filter(
    (drop) =>
      drop.source.type === 'crop' && drop.source.buildingId === farm.id && drop.source.cell < 3,
  );
  assert.equal(firstHarvestDrops.length, 3);
  assert.equal(demo.state.looseDrops.length, untouchedDrops.length + 3);
  for (const drop of firstHarvestDrops) {
    const job = originalJobs[drop.source.cell];
    assert.deepEqual(drop.source, {
      type: 'crop',
      buildingId: farm.id,
      cell: drop.source.cell,
      jobId: job.id,
    });
    assert.equal(drop.item, job.crop);
    assert.equal(drop.amount, job.yield);
    assert.deepEqual({ x6: drop.x6, z6: drop.z6 }, cropDropAnchor(farm, drop.source.cell));
    const pickup = { type: 'pickupDrop', dropId: drop.id };
    run(demo, pickup);
    reject(demo, pickup);
    assert.equal(demo.state.inventory[drop.item], inventoryBeforeHarvest[drop.item] + drop.amount);
  }
  assert.deepEqual(
    demo.state.looseDrops,
    untouchedDrops,
    'Unrelated showcase drops stay untouched',
  );
  assert.equal(collectionEvents.length, 3);
  assert.deepEqual(
    collectionEvents.map((event) => event.gains),
    ['vegetable', 'wheat', 'lettuce'].map((kind) => [{ kind, amount: 2 }]),
  );
  for (const event of collectionEvents) {
    assert.equal(event.command.type, 'pickupDrop');
    const drop = event.before.looseDrops.find((entry) => entry.id === event.command.dropId);
    assert.ok(drop, 'Collection preserves the exact removed drop source');
    assert.equal(
      collectionOrigin(event),
      null,
      'No rendered surface origin is invented by this CPU check',
    );
    const suppliedOrigin = { ...dropPosition(drop), y: 0.3 };
    assert.deepEqual(
      collectionOrigin(event, undefined, (id) => {
        assert.equal(id, drop.id);
        return suppliedOrigin;
      }),
      suppliedOrigin,
      'Collection origin uses the explicit renderer-supplied drop position',
    );
  }
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
  assert.deepEqual(piles.map((p) => p.amount).sort(), [1, 2, 4]);
  for (const pile of piles) {
    if (pile.amount < 3) reject(demo, { type: 'useTool', tool: 'saw', x: pile.x, z: pile.z });
    run(demo, { type: 'useTool', tool: 'hammer', x: pile.x, z: pile.z });
    assert.equal(
      demo.state.buildings.find((b) => b.x === pile.x && b.z === pile.z).kind,
      { 1: 'orderBoard', 2: 'crate', 4: 'house' }[pile.amount],
    );
  }
  assert.equal(demo.state.inventory.wood, beforeWood, 'Exact recipes do not invent surplus');
  const madeFrom = (amount) => {
    const pile = piles.find((p) => p.amount === amount);
    return demo.state.buildings.find((b) => b.x === pile.x && b.z === pile.z);
  };
  const house = madeFrom(4),
    crate = madeFrom(2);
  reject(demo, { type: 'dragMerge', sourceId: crate.id, targetId: house.id });
  const assembly = {
    type: 'hammerAssembly',
    tool: 'hammer',
    sources: [crate, house].map(({ id, kind, x, z, rotation }) => ({ id, kind, x, z, rotation })),
  };
  const beforeAssembly = { coins: demo.state.coins, inventory: { ...demo.state.inventory } };
  run(demo, assembly);
  assert.deepEqual(
    demo.state.buildings.find((b) => b.id === house.id),
    { ...house, kind: 'warehouse' },
  );
  assert.equal(
    demo.state.buildings.some((b) => b.id === crate.id),
    false,
  );
  assert.equal(demo.state.coins, beforeAssembly.coins);
  assert.deepEqual(demo.state.inventory, beforeAssembly.inventory);
  reject(demo, assembly);
  assert.equal(demo.state.tools.saw, 50);
  assert.equal(demo.state.tools.hammer, 10);
  const originalTrees = structuredClone(demo.state.trees);
  assert.equal(demo.state.terrainVersion, 4);
  assert.equal(originalTrees.length, 192);
  const tree = demo.state.trees[0];
  run(demo, { type: 'useTool', tool: 'axe', treeId: tree.id });
  reject(demo, { type: 'useTool', tool: 'axe', treeId: tree.id });
  assert.equal(demo.state.tools.axe, 50);
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
  assert.deepEqual(
    demo.state.trees,
    originalTrees.filter((t) => t.id !== tree.id),
  );
  await waitUntil(Math.max(normalReadyAt, completeAt));
  run(normal, { type: 'harvestCell', buildingId: 'b2', cell: 0 });
  assert.equal(normal.state.inventory.vegetable, 0);
  assert.equal(normal.state.looseDrops.length, 1);
  const normalDrop = normal.state.looseDrops[0];
  assert.equal(normalDrop.item, 'vegetable');
  assert.equal(normalDrop.amount, 2);
  normal = open('normal');
  assert.deepEqual(normal.state.looseDrops, [normalDrop], 'Unpicked output survives a restart');
  run(normal, { type: 'pickupDrop', dropId: normalDrop.id });
  reject(normal, { type: 'pickupDrop', dropId: normalDrop.id });
  assert.equal(normal.state.inventory.vegetable, 2);
  assert.equal(normal.state.looseDrops.length, 0);
  assert.equal(normal.state.tools.sickle, 90);
  const beforeLateHarvest = { ...demo.state.inventory },
    eventsBeforeLateHarvest = collectionEvents.length;
  for (let cell = 3; cell < 9; cell++)
    run(demo, { type: 'harvestCell', buildingId: farm.id, cell });
  assert.deepEqual(demo.state.inventory, beforeLateHarvest);
  assert.equal(collectionEvents.length, eventsBeforeLateHarvest);
  const lateHarvestDrops = demo.state.looseDrops.filter(
    (drop) =>
      drop.source.type === 'crop' && drop.source.buildingId === farm.id && drop.source.cell >= 3,
  );
  assert.equal(lateHarvestDrops.length, 6);
  assert.equal(demo.state.looseDrops.length, untouchedDrops.length + 6);
  for (const crop of ['vegetable', 'wheat', 'lettuce'])
    assert.equal(
      lateHarvestDrops
        .filter((drop) => drop.item === crop)
        .reduce((total, drop) => total + drop.amount, 0),
      4,
    );
  for (const drop of lateHarvestDrops) run(demo, { type: 'pickupDrop', dropId: drop.id });
  for (const crop of ['vegetable', 'wheat', 'lettuce'])
    assert.equal(demo.state.inventory[crop], beforeLateHarvest[crop] + 4);
  assert.deepEqual(
    demo.state.looseDrops,
    untouchedDrops,
    'Unrelated showcase drops stay untouched',
  );
  assert.equal(demo.state.tools.sickle, 90);
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
  assert.deepEqual(demo.state.trees, originalTrees);
  assert.equal(data.get('other-app.notes'), 'keep');
  assert.ok(
    collectionEvents.some(
      (event) =>
        event.command.type === 'useTool' &&
        event.command.tool === 'axe' &&
        event.gains.some((gain) => gain.kind === 'wood' && gain.amount === 2),
    ),
  );
  assert.ok(
    collectionEvents.some(
      (event) =>
        event.command.type === 'useTool' &&
        event.command.tool === 'axe' &&
        event.gains.some((gain) => gain.kind === 'treeSeed' && gain.amount === 2),
    ),
  );
  assert.equal(collectionEvents.filter((event) => event.command.type === 'harvestCell').length, 0);
  assert.equal(collectionEvents.filter((event) => event.command.type === 'pickupDrop').length, 9);
  const stackRetrieval = require('./stack-session.cjs')();
  const evidence = {
    passed: true,
    schemaVersion: 10,
    layer: 'TownProfiles + GameSession + storage, not browser input/rendering',
    timers:
      'Real elapsed time, no clock advance or gameplay state injection; official demo fixture used',
    elapsedMs: Date.now() - began,
    checks: [
      'old prototype keys remain recoverable until an explicit reset',
      'demo default and independent player save',
      'three crop mature/growing/empty cells and real production',
      'bulk order rejects stale replay',
      'direct crop purchases and shop trade',
      'real one/two/four wood hammer recipes and explicit snapshot house/crate hammer assembly',
      'axe targets actual state tree and repeated action rejected',
      'natural shore dock and real30second shipment survives reload',
      'unlimited durability: demo90/player90 unchanged',
      'both profile resets isolated and demo seed repeatable',
      'four real farm rotations preserve jobs/economy',
      'stack movement and reload preserve quantities; water drop rejects',
      'harvests leave exact loose output and explicit pickup alone emits collection events',
      'unpicked drops survive restart; repeated pickup preserves inventory and saved bytes',
      'collection events retain world source; renderer-dependent height is not fabricated',
    ],
    collectionEvents: collectionEvents.map((event) => ({
      command: event.command,
      gains: event.gains,
      origin: collectionOrigin(event),
      ...(event.command.type === 'pickupDrop'
        ? {
            savedDropPosition: dropPosition(
              event.before.looseDrops.find((drop) => drop.id === event.command.dropId),
            ),
          }
        : {}),
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
