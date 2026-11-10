/** Production drag classes and GameSession, with CPU picking/scene adapters only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { GameSession } = require('../.domain-build/application/GameSession');
const { fixture: stateFixture } = require('./helpers/loose-drop-trade.cjs');
const { SceneNode, presentation } = require('./helpers/demo-campaign-scene.cjs');
const { DropDrag } = presentation('DropDrag');
const { ToolRouter } = presentation('ToolRouter');
const { createUiState } = presentation('UiContracts');
function fixture(crop = 'vegetable') {
  const f = stateFixture(crop),
    values = new Map();
  f.state.inventory[crop] = 3;
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const session = new GameSession(
    storage,
    () => 16000,
    () => f.state,
  );
  const commands = [],
    events = [];
  const run = session.run.bind(session);
  session.run = (c) => {
    commands.push(c);
    return run(c);
  };
  session.setCollectionListener((event) => events.push(event));
  const root = new SceneNode('World'),
    ui = createUiState();
  const map = {
    cancelGesture() {},
    contains: (p) => p.x >= 0,
    screenRay: (p) => ({ o: { x: p.x, y: 20, z: p.y }, d: { x: 0, y: -1, z: 0 }, ...p }),
    ground: (p) => ({ x: p.x, y: 0, z: p.y }),
  };
  let lifted = null;
  const town = {
    pickDrop: (r) =>
      r.dropId !== lifted && session.state.looseDrops.some((d) => d.id === r.dropId)
        ? r.dropId
        : null,
    pickBuilding: (r) => r.buildingId ?? null,
    pickPlant: (r) => {
      const x = Math.floor(r.o.x - f.farm.x),
        z = Math.floor(r.o.z - f.farm.z);
      return x >= 0 && x < 3 && z >= 0 && z < 3
        ? { buildingId: f.farm.id, cell: z * 3 + x, distance: 20 }
        : null;
    },
    pickStack: () => null,
    pickTree: () => null,
    pickNatural: () => null,
    setLiftedDrop: (id) => {
      lifted = id;
    },
    dropOrigin: (id) => {
      const d = session.state.looseDrops.find((d) => d.id === id);
      return d ? { ...g.dropPosition(d), y: 0.023 } : null;
    },
  };
  const products = { acceptsProductDrop: (p) => p.x < 0, highlightProductDrop() {} };
  const drag = new DropDrag(root, session, ui, town, () => {}, products);
  const router = new ToolRouter(root, session, map, town, ui, () => {});
  const point = { x: f.drop.x6 / 6, y: f.drop.z6 / 6, dropId: f.drop.id, buildingId: f.farm.id };
  const target = (building) => ({
    x: building.x + 0.5,
    y: building.z + 0.5,
    buildingId: building.id,
  });
  const at = (p) => ({ x: p.x, y: 0, z: p.y });
  function lift(building) {
    const key = drag.candidate(map.screenRay(point));
    assert.equal(key, `drop:${f.drop.id}`);
    const p = target(building);
    drag.move(key, at(p), map.screenRay(p), p);
    return key;
  }
  function persist() {
    assert.deepEqual(new GameSession(storage, () => 16000).state, session.state);
  }
  return {
    ...f,
    root,
    session,
    commands,
    events,
    storage,
    values,
    map,
    town,
    drag,
    router,
    point,
    target,
    at,
    lift,
    persist,
  };
}
for (const crop of g.CROP_KEYS)
  for (const kind of ['shop', 'dock'])
    test(`${crop} loose drag previews ${kind}, commits once and persists without inventory gain`, () => {
      const f = fixture(crop),
        before = g.exportSave(f.session.state),
        target = f.target(f[kind]);
      const key = f.lift(f[kind]);
      assert.equal(g.exportSave(f.session.state), before);
      assert.equal(f.commands.length, 0);
      assert.match(f.session.message, kind === 'shop' ? /松手卖2份/ : /松手备货2份.*不会自动发船/);
      assert.ok(f.drag.marker);
      const inventory = { ...f.session.state.inventory };
      f.drag.drop(key, f.map.screenRay(target), target);
      assert.equal(f.commands.length, 1);
      assert.equal(f.commands[0].source.type, 'drop');
      assert.equal(f.commands[0].type, kind === 'shop' ? 'shopTrade' : 'dockTransfer');
      assert.deepEqual(f.session.state.inventory, inventory);
      assert.equal(f.session.state.looseDrops.length, 0);
      assert.equal(f.events.length, 0);
      assert.deepEqual(f.session.state.commerce.shipments, {});
      assert.equal(f.drag.ghost, null);
      assert.equal(f.drag.marker, null);
      f.persist();
      const saved = g.exportSave(f.session.state);
      f.drag.drop(key, f.map.screenRay(target), target);
      assert.equal(f.commands.length, 1);
      assert.equal(g.exportSave(f.session.state), saved);
    });
for (const mode of [
  'cancel',
  'off-map',
  'changed-source',
  'full-dock',
  'overflow-coins',
  'wrong-pointer',
])
  test(`loose trade ${mode} leaves goods and saved bytes unchanged`, () => {
    const f = fixture(),
      building = mode === 'full-dock' ? f.dock : f.shop,
      p = f.target(building);
    const key = f.lift(building);
    if (mode === 'changed-source') f.session.state.looseDrops[0].amount++;
    if (mode === 'full-dock')
      f.session.state.commerce.dockCargo[f.dock.id].wheat = g.COMMERCE.dockCapacity;
    if (mode === 'overflow-coins') f.session.state.coins = 1_000_000_000;
    const before = g.exportSave(f.session.state),
      writes = [...f.values];
    if (mode === 'cancel') f.drag.clear();
    else
      f.drag.drop(
        mode === 'wrong-pointer' ? 'drop:missing' : key,
        mode === 'off-map' ? null : f.map.screenRay(p),
        p,
      );
    assert.equal(g.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], writes);
    assert.equal(f.events.length, 0);
    if (mode !== 'wrong-pointer') {
      assert.equal(f.drag.ghost, null);
      assert.equal(f.drag.marker, null);
    }
    f.drag.clear(true);
  });
for (const crop of g.CROP_KEYS)
  for (const moves of [false, true])
    test(`${crop} sidebar merges into the visible drop above an empty farm, with ${moves ? 'move/up' : 'release only'} and no planting`, () => {
      const f = fixture(crop),
        before = g.exportSave(f.session.state);
      assert.equal(f.router.begin(crop, 7, { x: -5, y: 0 }), true);
      if (moves) f.router.move(7, f.point, false);
      assert.equal(g.exportSave(f.session.state), before);
      assert.equal(f.commands.length, 0);
      f.router.end(7, f.point, false);
      assert.equal(f.router.active, false);
      assert.equal(f.commands.length, 1);
      assert.equal(f.commands[0].type, 'mergeStockIntoDrop');
      assert.equal(f.session.state.inventory[crop], 2);
      assert.equal(f.session.state.looseDrops[0].amount, 3);
      assert.equal(f.session.state.buildings.find((b) => b.id === f.farm.id).cropJobs[0], null);
      assert.equal(f.events.length, 0);
      f.persist();
      f.router.end(7, f.point, false);
      assert.equal(f.commands.length, 1);
    });
for (const mode of [
  'cancel',
  'return',
  'off-map',
  'wrong-pointer',
  'full',
  'different',
  'changed-source',
  'changed-target',
  'disappeared-target',
  'restored-source',
  'restored-target',
])
  test(`sidebar drop ${mode} cannot spend stock, plant underneath or write a save`, () => {
    const f = fixture();
    if (mode === 'full') f.session.state.looseDrops[0].amount = 10;
    const item = mode === 'different' ? 'wheat' : 'vegetable';
    f.session.state.inventory[item] = 3;
    assert.equal(f.router.begin(item, 7, { x: -5, y: 0 }), true);
    f.router.move(7, f.point, false);
    if (['changed-source', 'restored-source'].includes(mode)) f.session.state.inventory[item]--;
    if (['changed-target', 'restored-target'].includes(mode))
      f.session.state.looseDrops[0].amount++;
    if (mode === 'disappeared-target') f.session.state.looseDrops = [];
    if (mode.startsWith('restored')) {
      f.router.move(7, f.point, false);
      if (mode === 'restored-source') f.session.state.inventory[item]++;
      else f.session.state.looseDrops[0].amount--;
    }
    const before = g.exportSave(f.session.state),
      writes = [...f.values];
    if (mode === 'cancel') f.router.cancel();
    else
      f.router.end(
        mode === 'wrong-pointer' ? 8 : 7,
        mode === 'off-map' || mode === 'return' ? { x: -5, y: 0 } : f.point,
        mode === 'return',
      );
    assert.equal(g.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], writes);
    assert.ok(f.commands.every((c) => c.type === 'mergeStockIntoDrop'));
    assert.equal(f.events.length, 0);
    f.router.cancel();
  });
test('a planting stroke already committed never also spends one unit on the loose drop', () => {
  const f = fixture(),
    emptyField = { x: f.farm.x + 1.5, y: f.farm.z + 0.5, buildingId: f.farm.id };
  delete emptyField.dropId;
  assert.equal(f.router.begin('vegetable', 7, { x: -5, y: 0 }), true);
  f.router.move(7, emptyField, false);
  assert.equal(f.session.state.inventory.vegetable, 2);
  assert.ok(f.session.state.buildings.find((b) => b.id === f.farm.id).cropJobs[1]);
  const before = g.exportSave(f.session.state);
  f.router.end(7, f.point, false);
  assert.equal(g.exportSave(f.session.state), before);
  assert.ok(f.commands.every((c) => c.type === 'plantCell'));
  assert.equal(f.session.state.looseDrops[0].amount, 2);
  f.persist();
});
for (const crop of g.CROP_KEYS)
  for (const moveAfterDrop of [false, true])
    test(`${crop} can leave a loose-drop hover and plant in an empty field on ${moveAfterDrop ? 'move' : 'release'}`, () => {
      const f = fixture(crop);
      const emptyField = { x: f.farm.x + 1.5, y: f.farm.z + 0.5, buildingId: f.farm.id };
      assert.equal(f.router.begin(crop, 7, { x: -5, y: 0 }), true);
      f.router.move(7, f.point, false);
      assert.match(f.session.message, /松手叠放/);
      assert.equal(f.commands.length, 0);
      if (moveAfterDrop) f.router.move(7, emptyField, false);
      f.router.end(7, emptyField, false);
      assert.equal(f.session.state.inventory[crop], 2);
      assert.equal(f.session.state.looseDrops[0].amount, 2);
      assert.ok(f.session.state.buildings.find((b) => b.id === f.farm.id).cropJobs[1]);
      assert.ok(f.commands.every((c) => c.type === 'plantCell'));
      assert.doesNotMatch(f.session.message, /松手叠放/);
      f.persist();
      const saved = g.exportSave(f.session.state);
      f.router.end(7, emptyField, false);
      assert.equal(g.exportSave(f.session.state), saved);
    });
for (const mode of ['source', 'target', 'missing-target', 'restored-target'])
  test(`a ${mode} change after loose-drop hover cannot fall through to planting in another field`, () => {
    const f = fixture();
    const emptyField = { x: f.farm.x + 1.5, y: f.farm.z + 0.5, buildingId: f.farm.id };
    assert.equal(f.router.begin('vegetable', 7, { x: -5, y: 0 }), true);
    f.router.move(7, f.point, false);
    if (mode === 'source') f.session.state.inventory.vegetable--;
    else if (mode === 'missing-target') f.session.state.looseDrops = [];
    else f.session.state.looseDrops[0].amount++;
    f.router.move(7, emptyField, false);
    if (mode === 'restored-target') f.session.state.looseDrops[0].amount--;
    const saved = g.exportSave(f.session.state),
      writes = [...f.values];
    f.router.end(7, emptyField, false);
    assert.equal(g.exportSave(f.session.state), saved);
    assert.deepEqual([...f.values], writes);
    assert.equal(f.commands.length, 0);
    assert.match(f.session.message, /物品已变化.*重新拖动/);
  });
