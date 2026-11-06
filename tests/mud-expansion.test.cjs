const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game.js');
const { blocksDockWater } = require('../.domain-build/domain/expansion.js');
const { stackDropCommand, stackDropHint } = require('../.domain-build/application/StackDrop.js');
const {
  soilSelection,
  soilSelectionAmount,
  soilWaterCommand,
} = require('../.domain-build/application/SoilWatering.js');
function town(version = 2) {
  const state = g.createGame(1000, 1, version);
  state.trees = [];
  state.naturalResources = [];
  return state;
}
function run(state, command) {
  const result = g.dispatch(state, command, 1000);
  assert.equal(result.ok, true, result.error);
  return result.state;
}
function rejects(state, command) {
  const json = JSON.stringify(state);
  const result = g.dispatch(state, command, 1000);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(JSON.stringify(state), json);
}
function shore(state) {
  for (let z = 1; z < 39; z++)
    for (let x = 1; x < 39; x++) {
      if (g.isLandCell(x, z, state.mapSeed, state.terrainVersion, state.landExtensions)) continue;
      if (
        [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(([dx, dz]) =>
          g.isLandCell(x + dx, z + dz, state.mapSeed, state.terrainVersion, state.landExtensions),
        )
      )
        return { x, z };
    }
  throw new Error('No shore');
}
function piles(state, item, amounts) {
  state.groundStacks = amounts.map((amount, index) => ({ x: 10 + index, z: 10, item, amount }));
}
test('watering explicitly selected soil piles consumes nine and preserves final-pile remainder', () => {
  const state = town();
  piles(state, 'soil', [5, 5]);
  let selected = soilSelection(state, [], { x: 10, z: 10 });
  selected = soilSelection(state, selected, { x: 10, z: 10 });
  assert.equal(selected.length, 1);
  assert.equal(soilSelectionAmount(state, selected), 5);
  selected = soilSelection(state, selected, { x: 11, z: 10 });
  assert.equal(soilSelectionAmount(state, selected), 9);
  const command = soilWaterCommand(selected);
  const result = run(state, command);
  assert.deepEqual(result.groundStacks, [
    { x: 11, z: 10, item: 'soil', amount: 1 },
    { x: 10, z: 10, item: 'mud', amount: 1 },
  ]);
  assert.deepEqual(result.inventory, state.inventory);
  assert.deepEqual(result.tools, state.tools);
  assert.deepEqual(
    state.groundStacks.map((p) => p.amount),
    [5, 5],
  );
  rejects(result, command);
  assert.deepEqual(g.importSave(g.exportSave(result), 1000), result);
});
test('soil selection supports nine one-unit piles and ignores repeat samples/other items', () => {
  const state = town();
  piles(state, 'soil', Array(9).fill(1));
  state.groundStacks.push({ x: 20, z: 10, item: 'stone', amount: 1 });
  let points = [];
  for (const p of state.groundStacks) points = soilSelection(state, points, p);
  assert.equal(points.length, 9);
  const result = run(state, soilWaterCommand(points));
  assert.deepEqual(
    result.groundStacks.map((p) => [p.item, p.amount]),
    [
      ['stone', 1],
      ['mud', 1],
    ],
  );
});
test('insufficient, duplicate, changed, null or remote output soil selections are atomic', () => {
  const state = town();
  piles(state, 'soil', [4, 4]);
  const base = {
    type: 'useTool',
    tool: 'wateringCan',
    x: 10,
    z: 10,
    sources: [
      { x: 10, z: 10 },
      { x: 11, z: 10 },
    ],
  };
  rejects(state, base);
  state.groundStacks[0].amount = 5;
  state.groundStacks[1].amount = 5;
  for (const command of [
    { ...base, sources: [base.sources[0], base.sources[0]] },
    { ...base, x: 12 },
    { ...base, sources: [null, base.sources[0]] },
    { ...base, sources: null },
    { ...base, sources: [base.sources[0], { x: 99, z: 99 }] },
  ])
    rejects(state, command);
  assert.equal(soilWaterCommand([]), null);
});
test('mud stacks cap at nine, partial merge conserves all units, and preview reveals no limit text', () => {
  const state = town();
  piles(state, 'mud', [8, 5]);
  const command = stackDropCommand({ x: 11, z: 10 }, { kind: 'ground', x: 10, z: 10 }, state);
  assert.equal(stackDropHint(state, command), '');
  const result = run(state, command);
  assert.deepEqual(
    result.groundStacks.map((p) => p.amount),
    [9, 4],
  );
  rejects(result, command);
  result.inventory.mud = 1;
  rejects(result, { type: 'dropProduct', item: 'mud', x: 10, z: 10 });
  assert.equal(g.stackLimitFor('mud'), 9);
  const raw = JSON.parse(g.exportSave(result));
  raw.groundStacks[0].amount = 10;
  assert.throws(() => g.importSave(JSON.stringify(raw), 1000));
});
test('nine mud reclaims only one adjacent water tile, survives reload and permits real ground actions', () => {
  for (const version of [1, 2]) {
    const state = town(version);
    piles(state, 'mud', [9]);
    const target = shore(state),
      before = g.landCellCount(1, version, state.landExtensions);
    const command = stackDropCommand({ x: 10, z: 10 }, { kind: 'ground', ...target }, state);
    assert.equal(command.type, 'expandLand');
    const result = run(state, command);
    assert.equal(result.groundStacks.length, 0);
    assert.equal(g.landCellCount(1, version, result.landExtensions), before + 1);
    assert.deepEqual(result.buildings, state.buildings);
    assert.equal(result.terrainVersion, version);
    assert.equal(g.terrainAt(target.x, target.z, 1, version, result.landExtensions).elevation, 0);
    assert.equal(g.isLandCell(target.x, target.z, 1, version), false);
    const placed = run(result, { type: 'dropProduct', item: 'vegetable', ...target });
    assert.deepEqual(g.importSave(g.exportSave(placed), 1000), placed);
    rejects(result, command);
  }
});
test('invalid expansion is atomic and all four dock facings protect their water footprint', () => {
  const state = town();
  piles(state, 'mud', [8]);
  const target = shore(state);
  const command = { type: 'expandLand', fromX: 10, fromZ: 10, ...target };
  rejects(state, command);
  state.groundStacks[0].amount = 9;
  for (const point of [
    { x: 10, z: 10 },
    { x: 0, z: 0 },
    { x: -1, z: 2 },
    { x: 39, z: 39 },
    { x: 1, z: 38 },
    { x: target.x + 0.5, z: target.z },
  ])
    rejects(state, { ...command, ...point });
  for (const rotation of [0, 1, 2, 3]) {
    const dock = { id: 'b99', kind: 'dock', rotation, x: 10, z: 10 };
    const p =
      rotation === 0
        ? { x: 10, z: 12 }
        : rotation === 1
          ? { x: 12, z: 10 }
          : rotation === 2
            ? { x: 10, z: 9 }
            : { x: 9, z: 10 };
    assert.equal(blocksDockWater(p, [dock]), true);
  }
  const demo = g.createDemoGame(60000),
    dock = demo.buildings.find((b) => b.kind === 'dock');
  demo.groundStacks = [{ x: 6, z: 7, item: 'mud', amount: 9 }];
  const point =
    dock.rotation === 0
      ? { x: dock.x, z: dock.z + 2 }
      : dock.rotation === 1
        ? { x: dock.x + 2, z: dock.z }
        : dock.rotation === 2
          ? { x: dock.x, z: dock.z - 1 }
          : { x: dock.x - 1, z: dock.z };
  rejects(demo, { type: 'expandLand', fromX: 6, fromZ: 7, ...point });
});
test('one mud upgrades only a basic house in place, leaving other attached goods and remainder', () => {
  for (const fromGround of [false, true]) {
    const state = town();
    state.buildings.push({ id: 'b3', kind: 'house', x: 10, z: 12, rotation: 1 });
    state.nextId = 4;
    state.fusion.attachments.b3 = {
      ...require('../.domain-build/domain/commerce.js').emptyStock(),
      wood: 2,
    };
    state.inventory.mud = 2;
    piles(state, 'mud', [9]);
    const command = fromGround
      ? stackDropCommand(
          { x: 10, z: 10 },
          { kind: 'building', building: state.buildings[2] },
          state,
        )
      : { type: 'attachMaterial', buildingId: 'b3', item: 'mud', quantity: 1 };
    assert.deepEqual(command, {
      type: 'attachMaterial',
      buildingId: 'b3',
      item: 'mud',
      quantity: 1,
      ...(fromGround ? { source: { ...state.groundStacks[0] } } : {}),
    });
    rejects(state, { type: 'buildResidence', buildingId: 'b3' });
    rejects(state, { type: 'useTool', tool: 'hammer', buildingId: 'b3' });
    const staged = run(state, command);
    assert.deepEqual(staged.buildings, state.buildings);
    assert.equal(staged.fusion.attachments.b3.mud, 1);
    assert.equal(staged.fusion.discoveries['build-residence'], undefined);
    const hammer = { type: 'useTool', tool: 'hammer', buildingId: 'b3' };
    const result = run(staged, hammer);
    assert.deepEqual(result.buildings[2], { ...state.buildings[2], kind: 'residence' });
    assert.equal(result.inventory.mud, fromGround ? 2 : 1);
    assert.equal(result.groundStacks[0].amount, fromGround ? 8 : 9);
    assert.deepEqual(result.fusion.attachments, state.fusion.attachments);
    assert.equal(g.getCapacity(result), g.getCapacity(state));
    assert.deepEqual(g.importSave(g.exportSave(result), 1000), result);
    rejects(result, hammer);
    if (fromGround) rejects(result, command);
  }
});
test('old v8 saves add only empty mud and extension fields, malformed extensions are rejected', () => {
  const state = town();
  const raw = JSON.parse(g.exportSave(state));
  raw.schemaVersion = 8;
  for (const item of ['rice', 'sapling', 'milledRice', 'flour', 'bread'])
    delete raw.inventory[item];
  delete raw.inventory.mud;
  delete raw.landExtensions;
  const restored = g.importSave(JSON.stringify(raw), 1000);
  assert.deepEqual(restored, state);
  for (const extensions of [
    null,
    [null],
    [{ x: 1, z: 38 }],
    [{ x: 10, z: 10 }],
    [{ x: 39, z: 39 }],
    [{ ...shore(state) }, { ...shore(state) }],
  ]) {
    assert.throws(() => g.importSave(JSON.stringify({ ...raw, landExtensions: extensions }), 1000));
  }
});
