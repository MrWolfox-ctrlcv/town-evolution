const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  dispatch,
  importSave,
  exportSave,
  getCapacity,
  ITEM_KEYS,
  isLandCell,
} = require('../.domain-build/domain/game.js');
function run(s, c, t = s.lastSeenAt) {
  const text = JSON.stringify(s),
    r = dispatch(s, c, t);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), text);
  return r.state;
}
function fail(s, c, t = s.lastSeenAt) {
  const text = JSON.stringify(s),
    r = dispatch(s, c, t);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), text);
}
const drop = (item, quantity = 1, x = 2, z = 5) => ({ type: 'dropProduct', item, quantity, x, z });
const pickup = (item, quantity = 1, x = 2, z = 5) => ({
  type: 'pickupProduct',
  item,
  quantity,
  x,
  z,
});
test('products transfer between inventory and same-item ground stacks, capped at five', () => {
  let s = createGame(0);
  s.inventory.wood = 6;
  s.inventory.stone = 1;
  s = run(s, drop('wood', 5));
  assert.equal(s.inventory.wood, 1);
  assert.equal(s.groundStacks[0].amount, 5);
  fail(s, drop('wood'));
  fail(s, drop('stone'));
  fail(s, drop('bogus'));
  fail(s, drop('wood', 0));
  s = run(s, pickup('wood', 2));
  assert.equal(s.inventory.wood, 3);
  assert.equal(s.groundStacks[0].amount, 3);
  s = run(s, pickup('wood', 3));
  assert.equal(s.inventory.wood, 6);
  assert.equal(s.groundStacks.length, 0);
  fail(s, pickup('wood'));
  assert.deepEqual(importSave(exportSave(s), 0), s);
});
test('all products can be placed and picked up without converting their identity', () => {
  let s = createGame(0);
  for (const item of ITEM_KEYS) s.inventory[item] = 1;
  for (const [x, item] of ITEM_KEYS.entries()) s = run(s, drop(item, 1, x + 6, 5));
  assert.equal(s.groundStacks.length, ITEM_KEYS.length);
  for (const item of ITEM_KEYS) assert.equal(s.inventory[item], 0);
  for (const [x, item] of ITEM_KEYS.entries()) s = run(s, pickup(item, 1, x + 6, 5));
  for (const item of ITEM_KEYS) assert.equal(s.inventory[item], 1);
});
test('axe spends one durability per tree, yields inventory wood and never duplicates chopped trees', () => {
  let s = createGame(0);
  const count = s.trees.length;
  const id = s.trees[0].id;
  s = run(s, { type: 'useTool', tool: 'axe', treeId: id });
  assert.equal(s.tools.axe, 9);
  assert.equal(s.inventory.wood, 1);
  assert.equal(s.trees.length, count - 1);
  assert.equal(s.groundStacks.length, 0);
  fail(s, { type: 'useTool', tool: 'axe', treeId: id });
  const noAxe = { ...s, tools: { ...s.tools, axe: 0 } };
  fail(noAxe, { type: 'useTool', tool: 'axe', treeId: s.trees[0].id });
  const full = { ...s, inventory: { ...s.inventory, wood: 15, vegetable: 1 } };
  fail(full, { type: 'useTool', tool: 'axe', treeId: s.trees[0].id });
});
test('three manually stacked woods and saw construct warehouse without charging money', () => {
  let s = createGame(0);
  for (const tree of [...s.trees].slice(0, 3))
    s = run(s, { type: 'useTool', tool: 'axe', treeId: tree.id });
  assert.equal(s.inventory.wood, 3);
  fail(s, { type: 'useTool', tool: 'saw', x: 2, z: 5 });
  for (let i = 0; i < 3; i++) s = run(s, drop('wood'));
  const before = s;
  s = run(s, { type: 'useTool', tool: 'saw', x: 2, z: 5 });
  assert.equal(s.coins, before.coins);
  assert.equal(s.tools.saw, 9);
  assert.equal(s.tools.axe, 7);
  assert.equal(s.inventory.wood, 0);
  assert.equal(s.groundStacks.length, 0);
  assert.equal(getCapacity(s), 32);
  assert.equal(s.buildings.at(-1).kind, 'warehouse');
  assert.deepEqual(importSave(exportSave(s), 0), s);
  fail(s, { type: 'useTool', tool: 'saw', x: 2, z: 5 });
});
test('four or five stacked woods consume exactly three and return surplus to new storage', () => {
  for (const amount of [4, 5]) {
    let s = createGame(0);
    s.inventory.wood = amount;
    s = run(s, drop('wood', amount));
    s = run(s, { type: 'useTool', tool: 'saw', x: 2, z: 5 });
    assert.equal(s.inventory.wood, amount - 3);
    assert.equal(s.groundStacks.length, 0);
    assert.equal(s.tools.saw, 9);
  }
});
test('invalid warehouse footprint, obstructing tree or another stack leaves material and tool intact', () => {
  let s = createGame(0);
  s.inventory.wood = 5;
  s.inventory.stone = 1;
  // A valid shore cell whose 2x2 recipe would extend into the water.
  const edge = [];
  for (let z = 1; z < 23; z++)
    for (let x = 1; x < 23; x++)
      if (
        isLandCell(x, z, s.mapSeed) &&
        !isLandCell(x + 1, z + 1, s.mapSeed) &&
        dispatch(s, drop('wood', 3, x, z), 0).ok
      )
        edge.push([x, z]);
  assert.ok(edge.length);
  const [x, z] = edge[0];
  s = run(s, drop('wood', 3, x, z));
  fail(s, { type: 'useTool', tool: 'saw', x, z });
  s = run(s, pickup('wood', 3, x, z));
  s = run(s, { type: 'placeTree', x: 9, z: 5 });
  s = run(s, drop('wood', 3, 8, 5));
  fail(s, { type: 'useTool', tool: 'saw', x: 8, z: 5 });
  s = run(s, pickup('wood', 3, 8, 5));
  s = run(s, drop('wood', 3));
  s = run(s, drop('stone', 1, 3, 5));
  fail(s, { type: 'useTool', tool: 'saw', x: 2, z: 5 });
  const broken = { ...s, tools: { ...s.tools, saw: 0 } };
  fail(broken, { type: 'useTool', tool: 'saw', x: 2, z: 5 });
  fail(s, drop('wood', 1, 3, 3));
  fail(s, { type: 'moveBuilding', buildingId: 'b2', x: 2, z: 5 });
});
test('sickle wear applies only to successful mature-cell harvest, with visible purchase and emergency recovery', () => {
  let s = run(createGame(0), { type: 'plantCell', buildingId: 'b2', cell: 0 });
  fail(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 1000);
  assert.equal(s.tools.sickle, 90);
  s = { ...s, tools: { ...s.tools, sickle: 0 } };
  fail(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 15000);
  s = run(s, { type: 'buyTool', tool: 'sickle' });
  assert.equal(s.coins, 110);
  assert.equal(s.tools.sickle, 90);
  s = run(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 15000);
  assert.equal(s.tools.sickle, 89);
  assert.equal(s.tools.fertilizer, 5);
  let poor = { ...s, coins: 0, tools: { ...s.tools, sickle: 0 } };
  poor = run(poor, { type: 'recoverTool', tool: 'sickle' });
  assert.equal(poor.tools.sickle, 90);
  assert.equal(poor.coins, 0);
  poor = importSave(exportSave(poor), 15000);
  poor.tools.sickle = 0;
  fail(poor, { type: 'recoverTool', tool: 'sickle' });
  fail(s, { type: 'buyTool', tool: 'wateringCan' });
  fail(s, { type: 'useTool', tool: 'hammer', x: 2, z: 5 });
});
test('obsolete test save is rejected rather than reinterpreted as natural terrain', () => {
  const old = createGame(0);
  old.schemaVersion = 5;
  const raw = JSON.stringify(old);
  assert.throws(() => importSave(raw, 0));
  assert.equal(JSON.stringify(old), raw);
  let s = createGame(0);
  const count = s.trees.length;
  s = run(s, { type: 'placeTree', x: 2, z: 5 });
  assert.equal(s.coins, 115);
  assert.equal(s.trees.length, count + 1);
  s = run(s, { type: 'useTool', tool: 'axe', treeId: s.trees.at(-1).id });
  assert.equal(s.inventory.wood, 1);
  assert.deepEqual(importSave(exportSave(s), 0), s);
});
test('malformed durability, stacks, ids and overlaps reject without silent reset', () => {
  const initial = createGame(0);
  for (const mutate of [
    (s) => (s.tools.axe = -1),
    (s) => (s.tools.fertilizer = 0.5),
    (s) => (s.toolRecoveryAvailable.saw = 'yes'),
    (s) => (s.nextTreeId = 1),
    (s) => {
      s.trees[0].x = 3;
      s.trees[0].z = 3;
    },
    (s) => (s.groundStacks = [{ x: 2, z: 5, item: 'wood', amount: 6 }]),
    (s) => (s.groundStacks = [{ x: s.trees[0].x, z: s.trees[0].z, item: 'wood', amount: 1 }]),
    (s) => (s.groundStacks = [{ x: 3, z: 3, item: 'wood', amount: 1 }]),
  ]) {
    const raw = JSON.parse(JSON.stringify(initial));
    mutate(raw);
    assert.throws(() => importSave(JSON.stringify(raw), 0));
  }
});
test('ground crops are recoverable seed sources, not eligible for another emergency seed', () => {
  for (const crop of ['vegetable', 'wheat', 'lettuce']) {
    let s = createGame(0);
    s.coins = 0;
    s.inventory.vegetable = 0;
    s.inventory[crop] = 1;
    s = run(s, drop(crop));
    fail(s, { type: 'recoverCrop' });
    s = run(s, pickup(crop));
    assert.equal(s.inventory[crop], 1);
  }
});
function crowdedTown(emptyCells) {
  const s = createGame(0);
  s.trees = [];
  s.groundStacks = [];
  s.buildings = [{ id: 'b1', kind: 'warehouse', x: 3, z: 3, rotation: 0 }];
  for (let z = 0; z < 24; z++)
    for (let x = 0; x < 24; x++) {
      if (
        !isLandCell(x, z, s.mapSeed) ||
        (x >= 3 && x < 5 && z >= 3 && z < 5) ||
        emptyCells.some((p) => p[0] === x && p[1] === z)
      )
        continue;
      s.buildings.push({ id: `b${s.buildings.length + 1}`, kind: 'cooler', x, z, rotation: 0 });
    }
  s.nextId = s.buildings.length + 1;
  return s;
}
test('tree and product placement cannot consume the last trade-recovery tile', () => {
  let s = crowdedTown([[8, 5]]);
  s.inventory.wood = 1;
  s = importSave(exportSave(s), 0);
  fail(s, { type: 'placeTree', x: 8, z: 5 });
  fail(s, drop('wood', 1, 8, 5));
  const recovered = run(s, { type: 'place', kind: 'orderBoard', x: 8, z: 5 });
  assert.equal(recovered.coins, 120);
});
test('saw recipe cannot fill final four cells without a trade facility', () => {
  let s = crowdedTown([
    [8, 5],
    [9, 5],
    [8, 6],
    [9, 6],
  ]);
  s.coins = 0;
  s.groundStacks = [{ x: 8, z: 5, item: 'wood', amount: 3 }];
  s = importSave(exportSave(s), 0);
  const nextId = s.nextId;
  fail(s, { type: 'useTool', tool: 'saw', x: 8, z: 5 });
  assert.equal(s.groundStacks[0].amount, 3);
  assert.equal(s.tools.saw, 10);
  assert.equal(s.nextId, nextId);
  const withBoard = run(s, { type: 'place', kind: 'orderBoard', x: 9, z: 6 });
  assert.equal(withBoard.coins, 0);
});
test('ordinary construction counts trees and product stacks when reserving the final empty tile', () => {
  let s = crowdedTown([
    [8, 5],
    [9, 5],
    [8, 6],
    [9, 6],
  ]);
  s.trees = [{ id: 't1', x: 8, z: 5 }];
  s.nextTreeId = 2;
  s.groundStacks = [
    { x: 9, z: 5, item: 'wood', amount: 1 },
    { x: 8, z: 6, item: 'stone', amount: 1 },
  ];
  s = importSave(exportSave(s), 0);
  fail(s, { type: 'place', kind: 'cooler', x: 9, z: 6 });
  const withBoard = run(s, { type: 'place', kind: 'orderBoard', x: 9, z: 6 });
  assert.equal(withBoard.coins, 120);
});
