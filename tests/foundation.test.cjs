const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  dispatch,
  importSave,
  exportSave,
  getCapacity,
  ITEM_KEYS,
  CONFIG,
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
test('wood transfers between inventory and same-item ground stacks, capped at six', () => {
  let s = createGame(0, undefined, 1);
  s.inventory.wood = 7;
  s.inventory.stone = 1;
  s = run(s, drop('wood', 6));
  assert.equal(s.inventory.wood, 1);
  assert.equal(s.groundStacks[0].amount, 6);
  fail(s, drop('wood'));
  fail(s, drop('stone'));
  fail(s, drop('bogus'));
  fail(s, drop('wood', 0));
  s = run(s, pickup('wood', 2));
  assert.equal(s.inventory.wood, 3);
  assert.equal(s.groundStacks[0].amount, 4);
  s = run(s, pickup('wood', 4));
  assert.equal(s.inventory.wood, 7);
  assert.equal(s.groundStacks.length, 0);
  fail(s, pickup('wood'));
  assert.deepEqual(importSave(exportSave(s), 0), s);
});
test('all products can be placed and picked up without converting their identity', () => {
  let s = createGame(0);
  s.trees = [];
  s.naturalResources = [];
  for (const item of ITEM_KEYS) s.inventory[item] = 1;
  for (const [x, item] of ITEM_KEYS.entries()) s = run(s, drop(item, 1, x + 6, 5));
  assert.equal(s.groundStacks.length, ITEM_KEYS.length);
  for (const item of ITEM_KEYS) assert.equal(s.inventory[item], 0);
  for (const [x, item] of ITEM_KEYS.entries()) s = run(s, pickup(item, 1, x + 6, 5));
  for (const item of ITEM_KEYS) assert.equal(s.inventory[item], 1);
});
test('axe has unlimited durability, yields inventory wood and never duplicates chopped trees', () => {
  let s = createGame(0);
  const count = s.trees.length;
  const id = s.trees[0].id;
  s = run(s, { type: 'useTool', tool: 'axe', treeId: id });
  assert.equal(s.tools.axe, 10);
  assert.equal(s.inventory.wood, 2);
  assert.equal(s.inventory.treeSeed, 2);
  assert.equal(s.trees.length, count - 1);
  assert.equal(s.groundStacks.length, 0);
  fail(s, { type: 'useTool', tool: 'axe', treeId: id });
  const noAxe = { ...s, tools: { ...s.tools, axe: 0 } };
  const unlimited = run(noAxe, { type: 'useTool', tool: 'axe', treeId: s.trees[0].id });
  assert.equal(unlimited.tools.axe, 0);
  assert.equal(unlimited.inventory.wood, 4);
  assert.equal(unlimited.inventory.treeSeed, 4);
  const full = { ...s, inventory: { ...s.inventory, wood: 15, vegetable: 1 } };
  fail(full, { type: 'useTool', tool: 'axe', treeId: s.trees[0].id });
});
test('four manually stacked woods and hammer construct a house without charging money', () => {
  let s = createGame(0, undefined, 1);
  for (const tree of [...s.trees].slice(0, 2))
    s = run(s, { type: 'useTool', tool: 'axe', treeId: tree.id });
  assert.equal(s.inventory.wood, 4);
  fail(s, { type: 'useTool', tool: 'hammer', x: 2, z: 5 });
  for (let i = 0; i < 4; i++) s = run(s, drop('wood'));
  const before = s;
  s = run(s, { type: 'useTool', tool: 'hammer', x: 2, z: 5 });
  assert.equal(s.coins, before.coins);
  assert.equal(s.tools.hammer, 10);
  assert.equal(s.tools.axe, 10);
  assert.equal(s.inventory.wood, 0);
  assert.equal(s.inventory.treeSeed, 4);
  assert.equal(s.groundStacks.length, 0);
  assert.equal(getCapacity(s), 16);
  assert.equal(s.buildings.at(-1).kind, 'house');
  assert.deepEqual(importSave(exportSave(s), 0), s);
  fail(s, { type: 'useTool', tool: 'hammer', x: 2, z: 5 });
});
test('wood crafting rejects unspecified counts atomically for each tool', () => {
  for (const [tool, counts] of [
    ['saw', [5, 6]],
    ['hammer', [5, 6]],
  ])
    for (const amount of counts) {
      let s = createGame(0, undefined, 1);
      s.inventory.wood = amount;
      s = run(s, drop('wood', amount));
      fail(s, { type: 'useTool', tool, x: 2, z: 5 });
      assert.equal(s.groundStacks[0].amount, amount);
      assert.equal(s.tools[tool], 10);
    }
});
test('invalid house footprint, obstructing tree or another stack leaves material and tool intact', () => {
  const fresh = () => {
    const state = createGame(0);
    state.trees = [];
    state.naturalResources = [];
    state.inventory.wood = 5;
    state.inventory.stone = 4;
    return state;
  };
  let s = fresh();
  const anchors = [
    [0, 0],
    [-1, 0],
    [0, -1],
    [-1, -1],
  ];
  const dryFootprint = (x, z) =>
    [0, 1].every((dx) =>
      [0, 1].every(
        (dz) =>
          x + dx >= 0 &&
          x + dx < CONFIG.gridSize &&
          z + dz >= 0 &&
          z + dz < CONFIG.gridSize &&
          isLandCell(x + dx, z + dz, s.mapSeed, s.terrainVersion, s.landExtensions),
      ),
    );
  // The generated shore is broad enough for alternate anchors. A legitimate
  // connected one-cell extension supplies a narrow coast without forged water.
  let narrowCoast = false;
  for (let z = 1; z < CONFIG.gridSize - 1 && !narrowCoast; z++)
    for (let x = 1; x < CONFIG.gridSize - 1 && !narrowCoast; x++) {
      if (isLandCell(x, z, s.mapSeed, s.terrainVersion)) continue;
      if (
        ![
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dz]) => isLandCell(x + dx, z + dz, s.mapSeed, s.terrainVersion))
      )
        continue;
      s.landExtensions = [{ x, z }];
      narrowCoast = anchors.every(([dx, dz]) => !dryFootprint(x + dx, z + dz));
    }
  assert.ok(narrowCoast, 'A connected narrow extension can be placed');
  s = importSave(exportSave(s), 0);
  // A valid shore cell with no fully dry containing 2x2 anchor, not merely
  // water southeast of the old fixed origin.
  const edge = [];
  for (let z = 0; z < CONFIG.gridSize; z++)
    for (let x = 0; x < CONFIG.gridSize; x++)
      if (
        isLandCell(x, z, s.mapSeed, s.terrainVersion, s.landExtensions) &&
        anchors.every(([dx, dz]) => !dryFootprint(x + dx, z + dz)) &&
        dispatch(s, drop('wood', 4, x, z), 0).ok
      )
        edge.push([x, z]);
  assert.ok(edge.length, 'The coast has a drop cell with all four house anchors blocked by water');
  const [x, z] = edge[0];
  s = run(s, drop('wood', 4, x, z));
  fail(s, { type: 'useTool', tool: 'hammer', x, z });
  assert.equal(s.groundStacks[0].amount, 4);
  assert.equal(s.tools.hammer, 10);
  s = run(s, pickup('wood', 4, x, z));

  const blockers = [
    [9, 7],
    [11, 7],
    [10, 6],
    [10, 8],
  ];
  s = fresh();
  for (const [x, z] of blockers) s = run(s, { type: 'placeTree', x, z });
  s = run(s, drop('wood', 4, 10, 7));
  fail(s, { type: 'useTool', tool: 'hammer', x: 10, z: 7 });
  assert.equal(s.groundStacks[0].amount, 4);
  assert.equal(s.tools.hammer, 10);
  s = run(s, pickup('wood', 4, 10, 7));

  s = fresh();
  s = run(s, drop('wood', 4, 10, 7));
  for (const [x, z] of blockers) s = run(s, drop('stone', 1, x, z));
  fail(s, { type: 'useTool', tool: 'hammer', x: 10, z: 7 });
  assert.equal(s.groundStacks.find((pile) => pile.item === 'wood').amount, 4);
  assert.equal(s.tools.hammer, 10);
  let broken = { ...s, tools: { ...s.tools, hammer: 0 } };
  fail(broken, { type: 'useTool', tool: 'hammer', x: 10, z: 7 });
  fail(s, drop('wood', 1, 3, 3));
  fail(s, { type: 'moveBuilding', buildingId: 'b2', x: 10, z: 7 });
  // Zero saved durability is still unlimited: clearing every blocker allows it.
  for (const [x, z] of blockers) broken = run(broken, pickup('stone', 1, x, z));
  broken = run(broken, { type: 'useTool', tool: 'hammer', x: 10, z: 7 });
  assert.equal(broken.tools.hammer, 0);
  assert.equal(broken.buildings.at(-1).kind, 'house');
  assert.deepEqual(importSave(exportSave(broken), 0), broken);
});
test('sickle can harvest with saved zero durability; unnecessary replenishment never spends resources', () => {
  let s = run(createGame(0), { type: 'plantCell', buildingId: 'b2', cell: 0 });
  fail(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 1000);
  assert.equal(s.tools.sickle, 90);
  s = { ...s, tools: { ...s.tools, sickle: 0 } };
  fail(s, { type: 'buyTool', tool: 'sickle' });
  s = run(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 15000);
  assert.equal(s.coins, 120);
  assert.equal(s.tools.sickle, 0);
  assert.equal(s.tools.fertilizer, 5);
  const poor = importSave(exportSave({ ...s, coins: 0 }), 15000);
  fail(poor, { type: 'recoverTool', tool: 'sickle' });
  assert.equal(poor.toolRecoveryAvailable.sickle, true);
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
  assert.equal(s.inventory.wood, 2);
  assert.equal(s.inventory.treeSeed, 2);
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
    (s) => (s.groundStacks = [{ x: 2, z: 5, item: 'wood', amount: 7 }]),
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
  s.naturalResources = [];
  s.groundStacks = [];
  s.buildings = [{ id: 'b1', kind: 'warehouse', x: 3, z: 3, rotation: 0 }];
  for (let z = 0; z < CONFIG.gridSize; z++)
    for (let x = 0; x < CONFIG.gridSize; x++) {
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
  fail(s, { type: 'place', kind: 'orderBoard', x: 8, z: 5 });
  const recovered = run(s, { type: 'repurposeToBoard', buildingId: 'b2' });
  assert.equal(recovered.coins, 120);
});
test('hammer house recipe cannot fill final four cells without a trade facility', () => {
  let s = crowdedTown([
    [8, 5],
    [9, 5],
    [8, 6],
    [9, 6],
  ]);
  s.coins = 0;
  s.groundStacks = [{ x: 8, z: 5, item: 'wood', amount: 4 }];
  s = importSave(exportSave(s), 0);
  const nextId = s.nextId;
  fail(s, { type: 'useTool', tool: 'hammer', x: 8, z: 5 });
  assert.equal(s.groundStacks[0].amount, 4);
  assert.equal(s.tools.hammer, 10);
  assert.equal(s.nextId, nextId);
  fail(s, { type: 'place', kind: 'orderBoard', x: 9, z: 6 });
  const withBoard = run(s, { type: 'repurposeToBoard', buildingId: 'b2' });
  assert.equal(withBoard.coins, 0);
});
test('crowded legacy towns cannot construct even free boards but retain explicit repurpose recovery', () => {
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
  fail(s, { type: 'place', kind: 'orderBoard', x: 9, z: 6 });
  const withBoard = run(s, { type: 'repurposeToBoard', buildingId: 'b2' });
  assert.equal(withBoard.coins, 120);
});
