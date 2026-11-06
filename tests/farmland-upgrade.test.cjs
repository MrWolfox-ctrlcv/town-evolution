const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looseAmount } = require('./helpers/loose-output.cjs');
const {
  createGame,
  dispatch,
  exportSave,
  importSave,
  footprint,
  CONFIG,
  isLandCell,
  farmGridSize,
  farmCellCount,
  farmMergePreview,
} = require('../.domain-build/domain/game.js');
const { farmCellAt } = require('../.domain-build/application/FarmCells.js');

function town() {
  const state = createGame(0, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.groundStacks = [];
  state.buildings = state.buildings.filter((b) => b.kind !== 'farm');
  return state;
}
function farm(id, x, z, rotation = 0) {
  return { id, kind: 'farm', x, z, rotation, cropJobs: Array(9).fill(null) };
}
function trio(missing = 3, rotation = 0, irrigated = false) {
  const state = town();
  let id = 2;
  for (let q = 0; q < 4; q++) {
    if (q === missing) continue;
    const b = farm(`b${id++}`, 10 + (q % 2) * 2, 10 + Math.floor(q / 2) * 2, rotation);
    if (irrigated) b.irrigated = true;
    state.buildings.push(b);
  }
  state.nextId = id;
  return state;
}
function accept(state, command, now = 0) {
  const before = JSON.stringify(state);
  const result = dispatch(state, command, now);
  assert.equal(result.ok, true, result.error);
  assert.equal(JSON.stringify(state), before, 'successful actions leave the input untouched');
  return result.state;
}
function reject(state, command) {
  const before = JSON.stringify(state);
  const result = dispatch(state, command, 1);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(JSON.stringify(state), before);
}
const merge = { type: 'dragMerge', sourceId: 'b2', targetId: 'b3' };
function worldCenter(b, cell, n = 3) {
  const width = n === 6 ? 4 : 2;
  let x = (((cell % n) + 0.5) * width) / n - width / 2;
  let z = ((Math.floor(cell / n) + 0.5) * width) / n - width / 2;
  for (let r = 0; r < b.rotation; r++) [x, z] = [z, -x];
  return { x: b.x + width / 2 + x, z: b.z + width / 2 + z };
}

test('digging creates a free nine-cell field and preserves all resources', () => {
  const state = town();
  state.coins = 0;
  const next = accept(state, { type: 'useTool', tool: 'diggingTool', x: 10, z: 10 });
  const b = next.buildings.find((b) => b.kind === 'farm');
  assert.ok(b);
  assert.deepEqual([b.x, b.z], [10, 10]);
  assert.equal(farmGridSize(b), 3);
  assert.equal(farmCellCount(b), 9);
  assert.deepEqual(b.cropJobs, Array(9).fill(null));
  assert.deepEqual(footprint(b), { width: 2, depth: 2 });
  assert.equal(next.coins, 0);
  assert.deepEqual(next.inventory, state.inventory);
  assert.deepEqual(next.tools, state.tools);
});

for (const blocker of ['tree', 'stone', 'product', 'building']) {
  test(`digging checks the entire 2x2 footprint against ${blocker}`, () => {
    const state = town();
    if (blocker === 'tree') state.trees.push({ id: 't1', x: 11, z: 11 });
    if (blocker === 'stone')
      state.naturalResources.push({ id: 'n1', kind: 'stone', amount: 1, x: 11, z: 11 });
    if (blocker === 'product') state.groundStacks.push({ item: 'wood', amount: 1, x: 11, z: 11 });
    if (blocker === 'building') state.buildings.push(farm('b2', 11, 11));
    reject(state, { type: 'useTool', tool: 'diggingTool', x: 10, z: 10 });
  });
}
test('digging rejects invalid positions and preserves the last trade recovery tile', () => {
  for (const [x, z] of [
    [-1, 10],
    [10.5, 10],
    [NaN, 10],
    [0, 0],
    [CONFIG.gridSize - 1, 10],
  ])
    reject(town(), { type: 'useTool', tool: 'diggingTool', x, z });
  const state = town();
  state.buildings = [];
  for (let z = 0; z < CONFIG.gridSize; z++)
    for (let x = 0; x < CONFIG.gridSize; x++)
      if (
        isLandCell(x, z, state.mapSeed, state.terrainVersion) &&
        !(x >= 10 && x < 12 && z >= 10 && z < 12)
      )
        state.groundStacks.push({ x, z, item: 'wood', amount: 1 });
  reject(state, { type: 'useTool', tool: 'diggingTool', x: 10, z: 10 });
});

test('watering an empty field changes only irrigation and cannot repeat', () => {
  const state = trio();
  const next = accept(state, { type: 'useTool', tool: 'wateringCan', buildingId: 'b2' });
  assert.equal(next.buildings[1].irrigated, true);
  assert.deepEqual(next.buildings[1].cropJobs, state.buildings[1].cropJobs);
  assert.deepEqual(next.inventory, state.inventory);
  assert.deepEqual(next.tools, state.tools);
  assert.equal(next.coins, state.coins);
  reject(next, { type: 'useTool', tool: 'wateringCan', buildingId: 'b2' });
  reject(state, { type: 'useTool', tool: 'wateringCan', buildingId: 'b1' });
  reject(state, { type: 'useTool', tool: 'wateringCan', buildingId: 'missing' });
});

for (let missing = 0; missing < 4; missing++)
  for (let rotation = 0; rotation < 4; rotation++) {
    test(`three-field upgrade preserves rotated jobs: missing quadrant ${missing}, rotation ${rotation}`, () => {
      const state = trio(missing, rotation, rotation % 2 === 1);
      const expected = Array(36).fill(null);
      for (const b of state.buildings.filter((b) => b.kind === 'farm')) {
        for (let cell = 0; cell < 9; cell++) {
          const job = {
            id: `j${state.nextId++}`,
            crop: ['vegetable', 'wheat', 'lettuce'][cell % 3],
            startedAt: 0,
            readyAt: 15000,
            durationMs: 15000,
            yield: 2,
          };
          b.cropJobs[cell] = job;
          const p = worldCenter(b, cell);
          const targetCell = Math.floor((p.z - 10) * 1.5) * 6 + Math.floor((p.x - 10) * 1.5);
          expected[targetCell] = job;
        }
      }
      const before = JSON.stringify(state);
      assert.ok(farmMergePreview(state, 'b2', 'b3'));
      assert.equal(JSON.stringify(state), before, 'preview is read-only');
      const next = accept(state, merge);
      const b = next.buildings.find((b) => b.id === 'b3');
      assert.deepEqual([b.kind, b.x, b.z, b.rotation, b.farmSize], ['farm', 10, 10, 0, 6]);
      assert.equal(Boolean(b.irrigated), rotation % 2 === 1);
      assert.equal(farmGridSize(b), 6);
      assert.equal(farmCellCount(b), 36);
      assert.deepEqual(footprint(b), { width: 4, depth: 4 });
      assert.deepEqual(b.cropJobs, expected);
      assert.equal(b.cropJobs.filter((j) => j === null).length, 9);
      assert.equal(next.buildings.length, state.buildings.length - 2);
      assert.equal(
        next.buildings.some((b) => b.id === 'b2' || b.id === 'b4'),
        false,
      );
      assert.deepEqual(next.inventory, state.inventory);
      assert.equal(next.coins, state.coins);
      assert.equal(next.nextId, state.nextId);
      assert.deepEqual(importSave(exportSave(next), 0), next);
    });
  }

for (const blocker of ['tree', 'stone', 'product', 'building']) {
  test(`upgrade rejects occupied reward quadrant: ${blocker}`, () => {
    const state = trio();
    if (blocker === 'tree') state.trees.push({ id: 't1', x: 13, z: 13 });
    if (blocker === 'stone')
      state.naturalResources.push({ id: 'n1', kind: 'stone', amount: 1, x: 13, z: 13 });
    if (blocker === 'product') state.groundStacks.push({ item: 'wood', amount: 1, x: 13, z: 13 });
    if (blocker === 'building') state.buildings.push(farm('b5', 12, 12));
    reject(state, merge);
  });
}
test('upgrade rejects two fields, straight lines, mismatched irrigation, self, missing and already large fields', () => {
  let state = trio();
  state.buildings.pop();
  reject(state, merge);
  state = trio();
  state.buildings.find((b) => b.id === 'b4').x = 14;
  state.buildings.find((b) => b.id === 'b4').z = 10;
  reject(state, merge);
  state = trio();
  state.buildings[1].irrigated = true;
  reject(state, merge);
  reject(trio(), { ...merge, sourceId: 'b3' });
  reject(trio(), { ...merge, sourceId: 'missing' });
  state = accept(trio(), merge);
  state.buildings.push(farm('b5', 14, 10), farm('b6', 10, 14));
  reject(state, { ...merge, sourceId: 'b5' });
});

test('upgrade combines attachments up to five and rejects overflow atomically', () => {
  const state = trio();
  const stock = (quantity) => ({
    ...Object.fromEntries(Object.keys(state.inventory).map((k) => [k, 0])),
    wood: quantity,
  });
  state.fusion.attachments = { b2: stock(2), b3: stock(2), b4: stock(1) };
  const next = accept(state, merge);
  assert.equal(next.fusion.attachments.b3.wood, 5);
  assert.equal(next.fusion.attachments.b2, undefined);
  assert.equal(next.fusion.attachments.b4, undefined);
  state.fusion.attachments.b4.wood = 2;
  reject(state, merge);
});

test('schema 8 preserves absent optional farm fields and validates additive field types', () => {
  const state = importSave(exportSave(createGame(0, 1, 1)), 0);
  const oldFarm = state.buildings.find((b) => b.kind === 'farm');
  assert.equal(Object.hasOwn(oldFarm, 'farmSize'), false);
  assert.equal(Object.hasOwn(oldFarm, 'irrigated'), false);
  assert.deepEqual(importSave(exportSave(state), 0), state);
  for (const [field, values] of [
    ['farmSize', [0, 3, 4, 5, 9, '6', null, true]],
    ['irrigated', [false, 'true', 1, null, {}]],
  ])
    for (const value of values) {
      const invalid = structuredClone(state);
      invalid.buildings.find((b) => b.kind === 'farm')[field] = value;
      assert.throws(
        () => importSave(JSON.stringify(invalid), 0),
        `${field} ${JSON.stringify(value)}`,
      );
    }
  for (const [field, value] of [
    ['farmSize', 6],
    ['irrigated', true],
  ]) {
    const invalid = structuredClone(state);
    invalid.buildings.find((b) => b.kind === 'warehouse')[field] = value;
    assert.throws(() => importSave(JSON.stringify(invalid), 0));
  }
  const invalid = structuredClone(state);
  invalid.buildings.find((b) => b.kind === 'farm').farmSize = 6;
  assert.throws(
    () => importSave(JSON.stringify(invalid), 0),
    'large field cannot retain only nine cells',
  );
});

for (const n of [3, 6])
  for (let rotation = 0; rotation < 4; rotation++)
    test(`${n}x${n} farm hit testing reverses yaw ${rotation} for every cell`, () => {
      const b = { ...farm('b2', 10, 10, rotation), ...(n === 6 ? { farmSize: 6 } : {}) };
      for (let cell = 0; cell < n * n; cell++)
        assert.equal(farmCellAt(b, worldCenter(b, cell, n)), cell);
      const width = n === 6 ? 4 : 2;
      for (const p of [
        { x: 9.99, z: 11 },
        { x: 10 + width + 0.01, z: 11 },
        { x: 11, z: 9.99 },
        { x: 11, z: 10 + width + 0.01 },
        { x: NaN, z: 11 },
      ])
        assert.equal(farmCellAt(b, p), null);
    });

test('preview rejects invalid merges without modifying the caller snapshot', () => {
  const state = trio();
  state.buildings.pop();
  const before = JSON.stringify(state);
  assert.throws(() => farmMergePreview(state, 'b2', 'b3'));
  assert.equal(JSON.stringify(state), before);
});

test('the reward quadrant must also be land, even when all three original fields are legal', () => {
  const state = town();
  let found = false;
  for (let z = 0; z < CONFIG.gridSize - 3 && !found; z++) {
    for (let x = 0; x < CONFIG.gridSize - 3 && !found; x++) {
      const legal = Array.from({ length: 4 }, (_, q) => {
        const qx = x + (q % 2) * 2,
          qz = z + Math.floor(q / 2) * 2;
        return [0, 1].every((dx) => [0, 1].every((dz) => isLandCell(qx + dx, qz + dz, 1, 1)));
      });
      if (legal.filter(Boolean).length !== 3) continue;
      const candidate = trio(legal.indexOf(false));
      for (const b of candidate.buildings.filter((b) => b.kind === 'farm')) {
        b.x += x - 10;
        b.z += z - 10;
      }
      // Remove the unrelated starter warehouse so coastal candidate placement is unambiguous.
      candidate.buildings = candidate.buildings.filter((b) => b.kind === 'farm');
      reject(candidate, merge);
      found = true;
    }
  }
  assert.equal(found, true, 'fixture includes a coastal three-field corner');
  const outside = trio();
  for (const b of outside.buildings.filter((b) => b.kind === 'farm')) b.x += CONFIG.gridSize - 12;
  reject(outside, merge);
});

test('large dry fields plant their final cell and cannot irrigate until harvested', () => {
  let state = accept(trio(), merge);
  const inventory = state.inventory.vegetable;
  state = accept(state, { type: 'plantCell', buildingId: 'b3', cell: 35 });
  assert.equal(state.inventory.vegetable, inventory - 1);
  const b = state.buildings.find((b) => b.id === 'b3');
  assert.ok(b.cropJobs[35]);
  assert.equal(b.cropJobs.filter(Boolean).length, 1);
  assert.deepEqual(importSave(exportSave(state), 0), state);
  reject(state, { type: 'plantCell', buildingId: 'b3', cell: 36 });
  reject(state, { type: 'useTool', tool: 'wateringCan', buildingId: 'b3' });
});

const { FarmSweep } = require('../.domain-build/application/FarmSweep.js');
const { pickFarmCrop } = require('../.domain-build/application/FarmPicking.js');
const { farmCellCenter } = require('../.domain-build/application/FarmCells.js');
const { farmBed, farmStages, farmVisuals } = require('../.domain-build/art/FarmCellKit.js');
const { CROPS } = require('../.domain-build/domain/game.js');

test('FarmSweep plants and harvests the 36th cell once per gesture', () => {
  let state = accept(trio(), merge);
  const sweep = new FarmSweep();
  sweep.begin('plant', 'vegetable');
  assert.equal(sweep.command(state, 'b3', 36), null);
  const command = sweep.command(state, 'b3', 35);
  assert.deepEqual(command, { type: 'plantCell', buildingId: 'b3', cell: 35, crop: 'vegetable' });
  state = accept(state, command);
  assert.equal(sweep.command(state, 'b3', 35), null);
  sweep.begin('harvest');
  assert.equal(sweep.command(state, 'b3', 34), null);
  const harvest = sweep.command(state, 'b3', 35);
  assert.deepEqual(harvest, { type: 'harvestCell', buildingId: 'b3', cell: 35 });
  state = accept(state, harvest, CROPS.vegetable.durationMs);
  assert.equal(state.buildings.find((b) => b.id === 'b3').cropJobs[35], null);
  assert.equal(sweep.command(state, 'b3', 35), null);
  sweep.cancel();
  assert.equal(sweep.command(state, 'b3', 0), null);
});

for (const rotation of [0, 1, 2, 3]) {
  test(`visible crop picking reaches large irrigated field cell 35 at rotation ${rotation}`, () => {
    const b = {
      ...farm('b2', 10, 10, rotation),
      farmSize: 6,
      irrigated: true,
      cropJobs: Array(36).fill(null),
    };
    b.cropJobs[35] = { id: 'j3', crop: 'wheat', startedAt: 0, readyAt: 15000 };
    const center = farmCellCenter(b, 35);
    const expected = worldCenter(b, 35, 6);
    assert.ok(Math.abs(center.x - expected.x) < 1e-10);
    assert.ok(Math.abs(center.z - expected.z) < 1e-10);
    const d = { x: -0.49, y: -0.65, z: -0.58 };
    const ray = { o: { x: center.x - d.x * 10, y: 0.55 - d.y * 10, z: center.z - d.z * 10 }, d };
    const hit = pickFarmCrop([b], ray, 15000);
    assert.equal(hit?.buildingId, 'b2');
    assert.equal(hit?.cell, 35);
    b.cropJobs[35] = null;
    assert.equal(pickFarmCrop([b], ray, 15000), null);
  });
}

test('large irrigated bed exposes 36 soil/water cells with matching input centers and 36 visual stages', () => {
  const bed = farmBed(6, true);
  assert.deepEqual(bed.footprint, [4, 4]);
  const soil = bed.parts.filter((p) => p.name.startsWith('soil-'));
  assert.equal(soil.length, 36);
  assert.equal(bed.parts.filter((p) => p.name === 'shallow-water').length, 36);
  assert.equal(bed.parts.filter((p) => p.name === 'water-glint').length, 36);
  assert.equal(bed.parts.filter((p) => p.name === 'soft-soil-ridge').length, 0);
  for (let cell = 0; cell < 36; cell++) {
    const p = soil[cell];
    assert.equal(
      farmCellAt({ ...farm('b2', -2, -2), farmSize: 6 }, { x: p.position[0], z: p.position[2] }),
      cell,
    );
    for (const axis of [0, 2])
      assert.ok(Math.abs(p.position[axis]) + p.size[axis] / 2 <= 2 + 1e-10);
  }
  const jobs = Array(36).fill(null);
  jobs[35] = { id: 'j3', crop: 'lettuce', startedAt: 0, readyAt: 15000 };
  assert.equal(farmStages(jobs, 15000).length, 36);
  assert.equal(farmStages(jobs, 15000)[35], 'ready');
  assert.equal(farmVisuals(jobs, 15000).length, 36);
  assert.equal(farmVisuals(jobs, 15000)[35], 'lettuce-ready');
  assert.equal(farmVisuals(jobs, 15000)[34], 'empty');
});

test('legacy irrigated fields rotate, grow and harvest saved crops with unchanged economic snapshots', () => {
  for (const crop of ['vegetable', 'wheat', 'lettuce']) {
    let state = accept(trio(), merge);
    state.inventory[crop] = 1;
    const before = state.inventory[crop];
    state = accept(state, { type: 'plantCell', buildingId: 'b3', cell: 35, crop });
    // Simulate an old save made before water fields rejected dryland planting.
    state.buildings.find((b) => b.id === 'b3').irrigated = true;
    state = importSave(exportSave(state), 0);
    const snapshot = structuredClone(state.buildings.find((b) => b.id === 'b3').cropJobs[35]);
    assert.equal(snapshot.durationMs, CROPS[crop].durationMs);
    assert.equal(snapshot.yield, CROPS[crop].yield);
    for (let rotation = 1; rotation <= 4; rotation++) {
      state = accept(state, { type: 'rotateBuilding', buildingId: 'b3' });
      const b = state.buildings.find((b) => b.id === 'b3');
      assert.equal(b.rotation, rotation % 4);
      assert.equal(b.irrigated, true);
      assert.deepEqual(b.cropJobs[35], snapshot);
      assert.equal(farmCellAt(b, farmCellCenter(b, 35)), 35);
      assert.deepEqual(importSave(exportSave(state), 0), state);
    }
    state = accept(state, { type: 'harvestCell', buildingId: 'b3', cell: 35 }, snapshot.readyAt);
    assert.equal(state.inventory[crop], before - 1);
    assert.equal(looseAmount(state, crop), snapshot.yield);
    assert.deepEqual(importSave(exportSave(state), snapshot.readyAt), state);
    assert.equal(state.buildings.find((b) => b.id === 'b3').cropJobs[35], null);
  }
});
