const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  dispatch,
  exportSave,
  importSave,
  getCapacity,
  getUsedStorage,
  ITEM_KEYS,
} = require('../.domain-build/domain/game');
const { GameSession } = require('../.domain-build/application/GameSession');
const stock = (values = {}) =>
  Object.fromEntries(ITEM_KEYS.map((item) => [item, values[item] ?? 0]));
const transfer = (type, item, quantity = 1, buildingId = 'b1') => ({
  type,
  item,
  quantity,
  buildingId,
});
const hammer = { type: 'useTool', tool: 'hammer', buildingId: 'b1' };
function run(s, command, now = s.lastSeenAt) {
  const before = JSON.stringify(s),
    result = dispatch(s, command, now);
  assert.equal(result.ok, true, result.error);
  assert.equal(
    JSON.stringify(s),
    before,
    'successful dispatch must leave original snapshot intact',
  );
  return result.state;
}
function fail(s, command) {
  const before = JSON.stringify(s),
    result = dispatch(s, command, s.lastSeenAt);
  assert.equal(result.ok, false);
  assert.equal(result.state, s, 'failure returns exact original object');
  assert.equal(
    JSON.stringify(s),
    before,
    'failure is atomic, including attachments and discoveries',
  );
}
function total(s, item) {
  return (
    s.inventory[item] +
    s.groundStacks.reduce((n, p) => n + (p.item === item ? p.amount : 0), 0) +
    Object.values(s.fusion.attachments).reduce((n, values) => n + values[item], 0)
  );
}
function ready() {
  let s = createGame(100);
  s.inventory.wood = 4;
  s.inventory.stone = 2;
  s = run(s, transfer('attachMaterial', 'wood', 3));
  return run(s, transfer('attachMaterial', 'stone', 2));
}
test('mixed inventory attachments conserve each material, cap five and reject invalid transfers atomically', () => {
  let s = ready();
  assert.equal(getUsedStorage(s), 2);
  for (const [item, amount] of [
    ['wood', 4],
    ['stone', 2],
    ['vegetable', 1],
  ])
    assert.equal(total(s, item), amount);
  for (const c of [
    transfer('attachMaterial', 'wood'),
    transfer('attachMaterial', 'wood', 0),
    transfer('attachMaterial', 'wood', -1),
    transfer('attachMaterial', 'wood', 0.5),
    transfer('attachMaterial', 'bogus'),
    transfer('detachMaterial', 'wood', 4),
    transfer('detachMaterial', 'stone', 1, 'missing'),
  ])
    fail(s, c);
  s = run(s, transfer('detachMaterial', 'wood', 3));
  s = run(s, transfer('detachMaterial', 'stone', 2));
  assert.equal(s.fusion.attachments.b1, undefined);
  assert.equal(s.inventory.wood, 4);
  assert.equal(s.inventory.stone, 2);
  assert.deepEqual(importSave(exportSave(s), 100), s);
});
test('full inventory rejects withdrawal without losing mounted materials; freeing room permits it', () => {
  let s = ready();
  s.inventory.vegetable = getCapacity(s) - s.inventory.wood;
  assert.equal(getUsedStorage(s), getCapacity(s));
  fail(s, transfer('detachMaterial', 'stone'));
  s = run(s, transfer('attachMaterial', 'vegetable', 1, 'b2'));
  s = run(s, transfer('detachMaterial', 'stone'));
  assert.equal(s.fusion.attachments.b1.stone, 1);
  assert.equal(s.inventory.stone, 1);
  assert.equal(getUsedStorage(s), getCapacity(s));
});
test('hammer consumes exactly two mounted wood and one durability while retaining surplus and currency', () => {
  const before = ready();
  const s = run(before, hammer, 150);
  assert.equal(s.buildings.find((b) => b.id === 'b1').kind, 'expandedWarehouse');
  assert.equal(s.fusion.attachments.b1.wood, 1);
  assert.equal(s.fusion.attachments.b1.stone, 2);
  assert.equal(total(s, 'wood'), total(before, 'wood') - 2);
  assert.equal(total(s, 'stone'), total(before, 'stone'));
  assert.equal(s.tools.hammer, before.tools.hammer - 1);
  assert.equal(s.coins, before.coins);
  assert.equal(getCapacity(s), 32);
  assert.deepEqual(s.fusion.discoveries['expand-warehouse'], { count: 1, firstDiscoveredAt: 150 });
  assert.deepEqual(importSave(exportSave(s), 150), s);
  fail(s, hammer);
  let exact = createGame(0);
  exact.inventory.wood = 2;
  exact = run(exact, transfer('attachMaterial', 'wood', 2));
  exact = run(exact, hammer);
  assert.equal(exact.fusion.attachments.b1, undefined);
});
test('hammer failures preserve materials, durability, buildings, coins and recipe records', () => {
  const broken = ready();
  broken.tools.hammer = 0;
  fail(broken, hammer);
  let insufficient = createGame(0);
  insufficient.inventory.wood = 1;
  insufficient = run(insufficient, transfer('attachMaterial', 'wood'));
  fail(insufficient, hammer);
  fail(ready(), { ...hammer, buildingId: 'b2' });
  fail(ready(), { ...hammer, buildingId: 'missing' });
  const busy = ready();
  busy.buildings[0].job = { id: 'j3', startedAt: 0, readyAt: 10000 };
  fail(busy, hammer);
});
test('successful recipes count once per commit; previews and failures do not discover or spend', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const session = new GameSession(
    storage,
    () => 200,
    () => ready(),
  );
  const snapshot = exportSave(session.state);
  for (let i = 0; i < 10; i++) assert.equal(session.reason(hammer), null);
  assert.equal(exportSave(session.state), snapshot);
  assert.equal(data.size, 0);
  assert.equal(session.run(hammer), true);
  assert.equal(session.state.fusion.discoveries['expand-warehouse'].count, 1);
  assert.equal(session.run(hammer), false);
  assert.equal(session.state.fusion.discoveries['expand-warehouse'].count, 1);
  let s = createGame(100);
  const ids = s.trees.slice(0, 2).map((t) => t.id);
  s = run(s, { type: 'useTool', tool: 'axe', treeId: ids[0] }, 200);
  s = run(s, { type: 'useTool', tool: 'axe', treeId: ids[1] }, 300);
  assert.deepEqual(s.fusion.discoveries['gather-wood'], { count: 2, firstDiscoveredAt: 200 });
  fail(s, { type: 'useTool', tool: 'axe', treeId: ids[0] });
  s = run(s, { type: 'upgrade', buildingId: 'b1', target: 'expandedWarehouse' });
  assert.equal(
    s.fusion.discoveries['expand-warehouse'],
    undefined,
    'coin shortcut is not material recipe discovery',
  );
});
test('old schema8 missing fusion imports additively without changing town, jobs or inventory', () => {
  let s = run(createGame(100), { type: 'plantCell', buildingId: 'b2', cell: 0 });
  const raw = JSON.parse(exportSave(s));
  delete raw.fusion;
  const restored = importSave(JSON.stringify(raw), 100);
  assert.deepEqual(restored.fusion, { attachments: {}, discoveries: {} });
  assert.deepEqual(restored, s);
  assert.deepEqual(importSave(exportSave(restored), 100), restored);
});
test('malformed fusion rejects rather than silently discarding material or discovery data', () => {
  const base = JSON.parse(exportSave(ready()));
  const mutations = [
    (s) => (s.fusion = null),
    (s) => (s.fusion = []),
    (s) => (s.fusion.attachments = []),
    (s) => delete s.fusion.discoveries,
    (s) => (s.fusion.attachments.missing = stock({ wood: 1 })),
    (s) => (s.fusion.attachments.b1 = stock()),
    (s) => (s.fusion.attachments.b1 = stock({ wood: 6 })),
    (s) => (s.fusion.attachments.b1 = stock({ wood: 3, stone: 3 })),
    (s) => (s.fusion.attachments.b1.wood = -1),
    (s) => (s.fusion.attachments.b1.wood = 1.5),
    (s) => delete s.fusion.attachments.b1.wood,
    (s) => (s.fusion.attachments.b1.unknown = 1),
    (s) => (s.fusion.discoveries.unknown = { count: 1, firstDiscoveredAt: 0 }),
    (s) => (s.fusion.discoveries['gather-wood'] = { count: 0, firstDiscoveredAt: 0 }),
    (s) => (s.fusion.discoveries['gather-wood'] = { count: 1.5, firstDiscoveredAt: 0 }),
    (s) => (s.fusion.discoveries['gather-wood'] = { count: 1, firstDiscoveredAt: 101 }),
    (s) => (s.fusion.discoveries['gather-wood'] = { count: 1, firstDiscoveredAt: -1 }),
  ];
  for (const mutate of mutations) {
    const s = structuredClone(base);
    mutate(s);
    const text = JSON.stringify(s);
    assert.throws(() => importSave(text, 100));
    assert.equal(JSON.stringify(s), text);
  }
});
function mergeTown() {
  let s = createGame(100);
  s = run(s, { type: 'place', kind: 'cooler', x: 5, z: 3 });
  s.inventory.wood = 4;
  s.inventory.stone = 2;
  s = run(s, transfer('attachMaterial', 'wood', 2));
  return run(s, transfer('attachMaterial', 'stone', 2, 'b3'));
}
test('combining either drag direction and adjacent combine retain both buildings mounted stock', () => {
  for (const command of [
    { type: 'combine', warehouseId: 'b1', coolerId: 'b3' },
    { type: 'dragMerge', sourceId: 'b3', targetId: 'b1' },
    { type: 'dragMerge', sourceId: 'b1', targetId: 'b3' },
  ]) {
    const before = mergeTown(),
      s = run(before, command);
    assert.equal(s.buildings.find((b) => b.id === 'b1').kind, 'coldWarehouse');
    assert.equal(
      s.buildings.some((b) => b.id === 'b3'),
      false,
    );
    assert.deepEqual(s.fusion.attachments.b1, stock({ wood: 2, stone: 2 }));
    assert.equal(s.fusion.attachments.b3, undefined);
    for (const item of ITEM_KEYS) assert.equal(total(s, item), total(before, item));
    assert.equal(s.fusion.discoveries['merge-cold'].count, 1);
    assert.deepEqual(importSave(exportSave(s), 100), s);
  }
});
test('merge over attachment limit and unaffordable merge are atomic', () => {
  let s = mergeTown();
  s = run(s, transfer('attachMaterial', 'wood', 2, 'b3'));
  fail(s, { type: 'dragMerge', sourceId: 'b3', targetId: 'b1' });
  s = mergeTown();
  s.coins = 0;
  fail(s, { type: 'combine', warehouseId: 'b1', coolerId: 'b3' });
});
test('mounted materials follow building identity through move/rotation without changing production jobs', () => {
  let s = run(createGame(100), { type: 'plantCell', buildingId: 'b2', cell: 4 });
  s.inventory.wood = 1;
  s = run(s, transfer('attachMaterial', 'wood', 1, 'b2'));
  const beforeJobs = structuredClone(s.buildings.find((b) => b.id === 'b2').cropJobs);
  s = run(s, { type: 'moveBuilding', buildingId: 'b2', x: 8, z: 5 });
  s = run(s, { type: 'rotateBuilding', buildingId: 'b2' });
  assert.deepEqual(s.buildings.find((b) => b.id === 'b2').cropJobs, beforeJobs);
  assert.deepEqual(s.fusion.attachments.b2, stock({ wood: 1 }));
  assert.deepEqual(importSave(exportSave(s), 100), s);
  fail(s, { type: 'moveBuilding', buildingId: 'b2', x: 3, z: 3 });
});
test('mounted crops count as planting sources and do not unlock duplicate emergency seed', () => {
  let s = createGame(0);
  s.coins = 0;
  s = run(s, transfer('attachMaterial', 'vegetable'));
  fail(s, { type: 'recoverCrop' });
  s = run(s, transfer('detachMaterial', 'vegetable'));
  assert.equal(s.inventory.vegetable, 1);
  assert.equal(s.cropRecoveryAvailable, true);
});
