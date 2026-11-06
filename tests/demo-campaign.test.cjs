/** Reachable player paths from an untouched demonstration island, not isolated recipes.
 * Real Cocos 3.8.8 web/native/mouse source -> pointer dispatcher -> production controls,
 * gestures, canonical CPU meshes, GameSession and persistence. Scene transforms, ray
 * projection, physical contacts and UI hit tests are adapters. No GPU/device claim.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../.domain-build/domain/game');
const { farmCellCenter } = require('../.domain-build/application/FarmCells');
const { touchesLand, blocksDockWater } = require('../.domain-build/domain/expansion');
const { fixture } = require('./helpers/demo-campaign-ui.cjs');
const pileId = (p) => `pile:${p.x}:${p.z}`;
const cell = (p) => ({ x: Math.floor(p.x), z: Math.floor(p.y) });

function craft(f, amount, kind) {
  const tool = ['orderBoard', 'crate', 'house', 'woodenPier'].includes(kind) ? 'hammer' : 'saw';
  const point = f.exposedGround('wood', amount, tool),
    at = cell(point);
  for (let i = 0; i < amount; i++) f.tool('wood', [point]);
  assert.equal(f.state().groundStacks.find((p) => p.x === at.x && p.z === at.z)?.amount, amount);
  const plan = game.toolCraftPlan(f.state(), tool, at.x, at.z);
  assert.equal(plan.reason, null);
  f.tool(tool, [f.visible('pile', pileId(at))]);
  const building = f.state().buildings.find((b) => b.id === plan.building.id);
  assert.equal(building?.kind, kind, f.session.message);
  f.persisted();
  return building.id;
}
function woodChain(f) {
  const original = { ...f.state().inventory };
  for (let i = 0; i < 4; i++) {
    const tree = f.state().trees.find((t) => f.visiblePoint('tree', t.id));
    assert.ok(tree, 'An exposed tree remains reachable');
    f.tool('axe', [f.visible('tree', tree.id)]);
    assert.equal(f.state().inventory.wood, original.wood + (i + 1) * 2);
    assert.equal(f.state().inventory.treeSeed, original.treeSeed + (i + 1) * 2);
  }
  f.persisted();
  const board = craft(f, 1, 'orderBoard'),
    crate = craft(f, 2, 'crate'),
    house = craft(f, 4, 'house');
  const capacity = game.getCapacity(f.state());
  f.tool('hammer', [f.visible('building', crate), f.visible('building', house)]);
  assert.equal(
    f.state().buildings.find((b) => b.id === house)?.kind,
    'warehouse',
    f.session.message,
  );
  assert.equal(game.getCapacity(f.state()), capacity + game.CONFIG.buildings.warehouse.capacity);
  assert.ok(!f.state().buildings.some((b) => b.id === crate));
  f.persisted();
  const shop = craft(f, 4, 'house');
  f.tool('hammer', [f.visible('building', board), f.visible('building', shop)]);
  assert.equal(f.state().buildings.find((b) => b.id === shop)?.kind, 'shop', f.session.message);
  assert.ok(!f.state().buildings.some((b) => b.id === board));
  assert.ok(f.state().commerce.shopStock[shop], 'New shop has real trade stock');
  f.persisted();
}
function mudChain(f) {
  const soil = f.state().groundStacks.filter((p) => p.item === 'soil');
  assert.equal(
    soil.reduce((sum, p) => sum + p.amount, 0),
    9,
  );
  f.tool(
    'wateringCan',
    soil.map((p) => f.visible('pile', pileId(p))),
  );
  const anchor = { x: soil[0].x, z: soil[0].z };
  const mud = () => f.state().groundStacks.find((p) => p.x === anchor.x && p.z === anchor.z);
  assert.equal(mud().item, 'mud');
  assert.equal(mud().amount, 1);
  f.persisted();
  // Produce the other eight units from actual resource blocks, rather than silently
  // using the preplaced nine-mud demonstration sample to bypass the full chain.
  for (let batch = 0; batch < 8; batch++) {
    const resource = f
      .state()
      .naturalResources.find((r) => r.kind === 'soil' && f.visiblePoint('natural', r.id));
    assert.ok(resource, 'An exposed soil resource is available');
    const before = f.state().inventory.soil;
    f.tool('diggingTool', [f.visible('natural', resource.id)]);
    assert.equal(f.state().inventory.soil, before);
    const drops = f
      .state()
      .looseDrops.filter((d) => d.source.type === 'natural' && d.source.resourceId === resource.id);
    assert.equal(
      drops.reduce((n, d) => n + d.amount, 0),
      9,
    );
    f.pickupDrops((d) => drops.some((p) => p.id === d.id));
    assert.equal(f.state().inventory.soil, before + 9, f.session.message);
    assert.ok(!f.state().naturalResources.some((r) => r.id === resource.id));
    const a = f.exposedGround('soil', 5);
    for (let i = 0; i < 5; i++) f.tool('soil', [a]);
    const b = f.exposedGround('soil', 4);
    for (let i = 0; i < 4; i++) f.tool('soil', [b]);
    f.tool('wateringCan', [a, b]);
    const source = cell(a);
    assert.ok(
      f
        .state()
        .groundStacks.some(
          (p) => p.x === source.x && p.z === source.z && p.item === 'mud' && p.amount === 1,
        ),
    );
    f.object(f.visible('pile', pileId(source)), f.visible('pile', pileId(anchor)));
    assert.equal(mud().amount, batch + 2, f.session.message);
    assert.equal(f.state().inventory.soil, before);
    f.persisted();
  }
  assert.equal(mud().amount, 9);
  const state = f.state(),
    size = game.worldSize(state.terrainVersion);
  let shore;
  outer: for (let z = 1; z < size - 1; z++)
    for (let x = 1; x < size - 1; x++) {
      const at = { x, z };
      if (
        !game.isLandCell(x, z, state.mapSeed, state.terrainVersion, state.landExtensions) &&
        touchesLand(at, state.mapSeed, state.terrainVersion, state.landExtensions) &&
        !blocksDockWater(at, state.buildings)
      ) {
        shore = at;
        break outer;
      }
    }
  assert.ok(shore, 'A connected coast cell remains available');
  const before = state.landExtensions.length;
  f.object(f.visible('pile', pileId(anchor)), { x: shore.x + 0.5, y: shore.z + 0.5 });
  assert.equal(f.state().landExtensions.length, before + 1, f.session.message);
  assert.ok(f.state().landExtensions.some((p) => p.x === shore.x && p.z === shore.z));
  assert.equal(mud(), undefined, 'Exactly the newly crafted nine-mud stack was consumed');
  f.persisted();
}
function farmChain(f) {
  const farms = f.state().buildings.filter((b) => b.kind === 'farm' && !b.farmSize && !b.irrigated);
  let pair;
  outer: for (const a of farms)
    for (const b of farms)
      if (a !== b) {
        try {
          pair = { a, b, plan: game.farmMergePreview(f.state(), a.id, b.id) };
          break outer;
        } catch {
          /* Only a legal local trio is a candidate. */
        }
      }
  assert.ok(pair, 'The initial demonstration has a legal three-farm pattern');
  const originalJobs = pair.plan.building.cropJobs.filter(Boolean).map((job) => ({ ...job }));
  assert.equal(originalJobs.length, 9);
  f.object(f.visible('building', pair.a.id), f.visible('building', pair.b.id));
  const large = () => f.state().buildings.find((b) => b.id === pair.b.id);
  assert.equal(large().farmSize, 6, f.session.message);
  assert.deepEqual(large().cropJobs.filter(Boolean), originalJobs);
  assert.equal(large().cropJobs.length, 36);
  f.persisted();
  // Premature irrigation cannot destroy the existing dry crops.
  const protectedSave = game.exportSave(f.state());
  f.tool('wateringCan', [f.visible('building', large().id)]);
  assert.equal(game.exportSave(f.state()), protectedSave);
  assert.match(f.session.message, /先收获/);
  f.advanceTo(Math.max(...originalJobs.map((job) => job.readyAt)));
  const stock = { ...f.state().inventory };
  for (let index = 0; index < 36; index++) {
    if (!large().cropJobs[index]) continue;
    const p = farmCellCenter(large(), index);
    f.tool('sickle', [{ x: p.x, y: p.z }]);
    assert.equal(large().cropJobs[index], null, f.session.message);
  }
  assert.ok(large().cropJobs.every((job) => job === null));
  assert.deepEqual(f.state().inventory, stock);
  f.pickupDrops((d) => d.source.type === 'crop' && d.source.buildingId === large().id);
  for (const crop of game.CROP_KEYS)
    assert.equal(
      f.state().inventory[crop],
      stock[crop] +
        originalJobs.filter((job) => job.crop === crop).reduce((sum, job) => sum + job.yield, 0),
    );
  f.tool('wateringCan', [f.visible('building', large().id)]);
  assert.equal(large().irrigated, true, f.session.message);
  f.persisted();
}
function shippingChain(f) {
  const dock = f.state().buildings.find((b) => b.kind === 'dock');
  f.commerce(dock.id, '领取');
  f.persisted();
  const pile = f.state().groundStacks.find((p) => p.item === 'vegetable' && p.amount === 10);
  const coins = f.state().coins,
    cargo = f.state().commerce.dockCargo[dock.id].vegetable;
  f.object(f.visible('pile', pileId(pile)), f.visible('building', dock.id));
  assert.equal(f.state().commerce.dockCargo[dock.id].vegetable, cargo + 10);
  assert.equal(f.state().coins, coins, 'Staging is not selling');
  assert.ok(!f.state().groundStacks.some((p) => p.x === pile.x && p.z === pile.z));
  f.persisted();
  f.commerce(dock.id, '发船');
  const shipment = f.state().commerce.shipments[dock.id];
  assert.equal(f.state().coins, coins, 'Dispatch does not pay before arrival');
  assert.ok(Object.values(f.state().commerce.dockCargo[dock.id]).every((amount) => amount === 0));
  const receipt = { type: 'dockCollect', buildingId: dock.id, shipmentId: shipment.id };
  const inflight = game.exportSave(f.state());
  assert.equal(f.session.run(receipt), false);
  assert.equal(game.exportSave(f.state()), inflight);
  f.persisted();
  f.advanceTo(shipment.completeAt);
  f.commerce(dock.id, '领取');
  assert.equal(f.state().coins, coins + shipment.reward);
  assert.equal(f.state().commerce.shipments[dock.id], undefined);
  const settled = game.exportSave(f.state());
  assert.equal(f.session.run(receipt), false);
  assert.equal(game.exportSave(f.state()), settled);
  f.persisted();
}

for (const source of ['native', 'web', 'mouse'])
  test(`untouched demo campaign is playable through ${source} input and survives every save checkpoint`, (t) => {
    const f = fixture(source);
    t.mock.method(Date, 'now', f.now);
    try {
      for (const [label, run] of [
        ['wood -> board/crate/houses -> warehouse/shop', woodChain],
        ['soil -> nine newly crafted mud -> connected land', mudChain],
        ['three farms -> retained crops -> harvest -> large paddy', farmChain],
        ['ground cargo -> staged dock -> shipment -> one receipt', shippingChain],
      ]) {
        run(f);
        t.diagnostic(`${label}: passed, ${f.gestures()} cumulative gestures`);
      }
      assert.ok(
        f.gestures() >= 130,
        'Every individual stock drop and deliberate release was delivered',
      );
    } finally {
      f.dispose();
    }
  });
