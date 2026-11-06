const { serializedSaveLength } = require('../.domain-build/domain/save-limits');
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../.domain-build/domain/game');
const { clone } = require('../.domain-build/domain/state');
const { assertGroundCell } = require('../.domain-build/domain/ground-placement');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { naturalLayerQuanta, v6EditPlane } = require('../.domain-build/domain/v6-material-volume');
const { materialAmount } = require('../.domain-build/domain/v6-material-amount');
const { planTerrain6Edit } = require('../.domain-build/domain/v6-edit-plan');
const prep = new V6WorldPreparation(1937);
while (prep.step(50000).status !== 'ready') {}
prep.takeResult();
const initial = G.createGame(1000, 1937, 6);
const target = { x: 77, z: 43 };
const command = (state, kind, level, extra = {}) => ({
  type: 'editTerrain6',
  kind,
  ...target,
  level,
  expectedOperation: state.terrain6.nextOperation,
  ...extra,
});
const apply = (state, cmd) => {
  const result = G.dispatch(state, cmd, state.lastSeenAt + 1);
  assert.equal(result.ok, true, result.error);
  return result.state;
};
const pickup = (state) => {
  for (const drop of [...state.looseDrops])
    state = apply(state, { type: 'pickupDrop', dropId: drop.id });
  return state;
};
const roundtrip = (state) => {
  const text = G.exportSave(state),
    loaded = G.importSave(text, state.lastSeenAt);
  assert.equal(
    serializedSaveLength(state),
    text.length,
    'Live canonical v6 size equals actual export',
  );
  assert.equal(G.exportSave(loaded), text);
  return loaded;
};
const fill = (state, level, material = 'soil') =>
  command(state, 'fill', level, {
    material,
    source: { type: 'inventory', item: material, amount: state.inventory[material] },
  });
const materialTotal = (state) =>
  state.inventory.soil +
  state.inventory.stone +
  state.looseDrops
    .filter((d) => ['soil', 'stone'].includes(d.item))
    .reduce((n, d) => n + d.amount, 0) +
  state.groundStacks
    .filter((d) => ['soil', 'stone'].includes(d.item))
    .reduce((n, d) => n + d.amount, 0);

test('v6 mixed volume shares one layer budget and positive slivers are real quanta', () => {
  const world = {
    size: 192,
    vertex: () => ({ ground: v6EditPlane(0) + 0.25, stone: 0.5, soil: 0 }),
    resourceAt: () => ({ id: 'n1_1', x: 1, z: 1, kind: 'stone', amount: 1 }),
    occupiedLevels: () => [1],
  };
  const q = naturalLayerQuanta(world, { x: 1, z: 1, initialResourceAmount: 1 }, 1);
  assert.equal(q.soil + q.stone, 3072);
  assert.equal(q.soil, 1024);
  assert.equal(q.stone, 2048);
  const sliver = { ...world, vertex: () => ({ ground: v6EditPlane(0), stone: 1e-8, soil: 0 }) };
  assert.ok(naturalLayerQuanta(sliver, { x: 1, z: 1, initialResourceAmount: 1 }, 1).stone > 0);
  const wedge = {
    ...world,
    vertex: (x, z) => ({
      ground: x === 4 && z === 4 ? Math.fround(v6EditPlane(1) - 1e-7) : v6EditPlane(2),
      stone: 0,
      soil: 0,
    }),
    resourceAt: () => null,
    occupiedLevels: () => [],
  };
  assert.ok(
    naturalLayerQuanta(wedge, { x: 1, z: 1, initialResourceAmount: 0 }, 1).soil < 4096,
    'A positive corner void must cost at least one quantum',
  );
  assert.equal(materialAmount(1 / 4096), true);
  assert.equal(materialAmount(1 / 8192), false);
});

test('v6 natural slope dig emits actual soil and stone drops, never credits inventory', () => {
  const level = G.terrain6EditLevel(initial, target.x, target.z, 'dig');
  const plan = planTerrain6Edit(initial, command(initial, 'dig', level));
  assert.ok(plan.yield.soil > 0 && plan.yield.stone > 0);
  assert.ok(plan.yield.soil + plan.yield.stone <= 1);
  const state = apply(initial, command(initial, 'dig', level));
  assert.deepEqual(state.inventory, initial.inventory);
  assert.equal(
    state.looseDrops.reduce((n, d) => n + d.amount, 0),
    plan.yield.soil + plan.yield.stone,
  );
  assert.ok(state.looseDrops.every((d) => d.source.type === 'terrain6' && d.amount > 0));
  assert.equal(
    state.naturalResources.some((r) => r.x === target.x && r.z === target.z),
    false,
  );
  roundtrip(state);
  const loaded = roundtrip(state);
  assert.deepEqual(loaded.inventory, state.inventory);
  assert.deepEqual(loaded.looseDrops, state.looseDrops);
  const collected = pickup(loaded);
  assert.equal(collected.inventory.soil, plan.yield.soil);
  assert.equal(collected.inventory.stone, plan.yield.stone);
  roundtrip(collected);
});

test('v6 natural direct fill retains buried resources and later construction survives load', () => {
  let state = clone(initial);
  state.inventory.soil = 2;
  state.inventory.wood = 2;
  const original = state.naturalResources.find((r) => r.x === target.x && r.z === target.z);
  const level = G.terrain6EditLevel(state, target.x, target.z, 'fill');
  const plan = planTerrain6Edit(state, fill(state, level));
  assert.ok(plan.cost.soil > 0 && plan.cost.soil < 1);
  state = apply(state, fill(state, level));
  assert.equal(state.inventory.soil, 2 - plan.cost.soil);
  assert.deepEqual(
    state.naturalResources.find((r) => r.id === original.id),
    original,
  );
  assert.equal(G.getV6EditSurface(state).exposedResourceAt(target.x, target.z), null);
  state = apply(state, { type: 'dropProduct', item: 'wood', quantity: 2, ...target });
  state = apply(state, { type: 'useTool', tool: 'hammer', ...target });
  assert.ok(
    state.buildings.some((b) => b.kind === 'crate' && b.x === target.x && b.z === target.z),
  );
  state = roundtrip(state);
  const rejected = G.dispatch(state, command(state, 'dig', 0), state.lastSeenAt + 1);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.state, state);
});

test('v6 mixed natural plus fill excavation returns one complete layer, cycles cannot mint material', () => {
  let state = clone(initial);
  state.inventory.soil = 3;
  const natural = planTerrain6Edit(state, command(state, 'dig', 0)).yield;
  state = apply(state, fill(state, 1));
  const excavation = planTerrain6Edit(state, command(state, 'dig', 0));
  assert.equal(excavation.yield.soil + excavation.yield.stone, 1);
  state = pickup(apply(state, command(state, 'dig', 0)));
  const total = 3 + natural.soil + natural.stone;
  assert.equal(materialTotal(state), total);
  for (let i = 0; i < 12; i++) {
    state = apply(state, fill(state, 1));
    state = pickup(apply(state, command(state, 'dig', 0)));
    assert.equal(materialTotal(state), total);
  }
  roundtrip(state);
});

test('v6 selected ground source is exact and fractional remainder stays in the physical pile', () => {
  let state = clone(initial);
  let point;
  for (let z = 1; z < 36 && !point; z++)
    for (let x = 1; x < 36 && !point; x++) {
      try {
        assertGroundCell(state, x, z);
        point = { x, z };
      } catch {}
    }
  assert.ok(point);
  state.groundStacks.push({ ...point, item: 'soil', amount: 2 });
  const source = { type: 'ground', stack: { ...state.groundStacks[0] } };
  const cmd = command(state, 'fill', 1, { material: 'soil', source });
  const cost = planTerrain6Edit(state, cmd).cost.soil;
  state = apply(state, cmd);
  assert.equal(state.groundStacks[0].amount, 2 - cost);
  assert.equal(state.inventory.soil, 0);
  roundtrip(state);
  const stale = G.dispatch(
    state,
    { ...cmd, level: 2, expectedOperation: state.terrain6.nextOperation },
    2000,
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.state, state);
});

test('v6 stale, insufficient, occupied, protected and exhausted-drop-limit actions are atomic', () => {
  const cases = [
    [
      initial,
      command(initial, 'fill', 1, {
        material: 'soil',
        source: { type: 'inventory', item: 'soil', amount: 0 },
      }),
    ],
    [initial, { ...command(initial, 'dig', 0), expectedOperation: 0 }],
    [initial, { ...command(initial, 'dig', 0), x: 3, z: 3 }],
    [initial, { ...command(initial, 'dig', 0), x: 0, z: 0 }],
  ];
  const blocked = clone(initial);
  blocked.looseDrops = Array.from({ length: 4096 }, (_, i) => ({
    id: `d${100 + i}`,
    item: 'soil',
    amount: 1,
    x6: 1,
    z6: 1,
    source: { type: 'terrain6', x: 1, z: 1, operation: 1, kind: 'soil' },
  }));
  cases.push([blocked, command(blocked, 'dig', 0)]);
  for (const [state, cmd] of cases) {
    const before = JSON.stringify(state),
      result = G.dispatch(state, cmd, 2000);
    assert.equal(result.ok, false);
    assert.equal(result.state, state);
    assert.equal(JSON.stringify(state), before);
  }
});

test('v6 checkpoint has no 4096-operation journal lifetime and replay never repays drops', () => {
  let state = apply(initial, command(initial, 'dig', 0));
  state = pickup(state);
  state.terrain6.nextOperation = 6000;
  state.inventory.soil += 2;
  state = roundtrip(state);
  state = apply(state, fill(state, 1));
  assert.equal(state.terrain6.nextOperation, 6001);
  assert.equal(state.terrain6.cells.length, 1);
  roundtrip(state);
});

test('v6 platform farming uses the whole footprint and rejects forged saved heights', () => {
  let state = clone(initial);
  state.inventory.soil = 14;
  state.trees = state.trees.filter(
    (p) => !(p.x >= target.x && p.x < target.x + 2 && p.z >= target.z && p.z < target.z + 2),
  );
  const commonLevel = Math.max(
    ...[0, 1, 2, 3].map((i) =>
      G.terrain6EditLevel(state, target.x + (i % 2), target.z + Math.floor(i / 2), 'fill'),
    ),
  );
  for (let dz = 0; dz < 2; dz++)
    for (let dx = 0; dx < 2; dx++) {
      const cmd = { ...fill(state, commonLevel), x: target.x + dx, z: target.z + dz };
      state = apply(state, cmd);
    }
  state = apply(state, { type: 'useTool', tool: 'diggingTool', ...target });
  const farm = state.buildings.find(
    (b) => b.kind === 'farm' && b.x === target.x && b.z === target.z,
  );
  assert.ok(farm);
  assert.equal(farm.baseElevation, v6EditPlane(commonLevel));
  state = roundtrip(state);
  const wrong = JSON.parse(G.exportSave(state));
  wrong.buildings.find((b) => b.id === farm.id).baseElevation += 1;
  assert.throws(() => G.importSave(JSON.stringify(wrong), state.lastSeenAt), /高度/);
  const missing = JSON.parse(G.exportSave(state));
  delete missing.buildings[0].baseElevation;
  assert.throws(() => G.importSave(JSON.stringify(missing), state.lastSeenAt), /高度/);
});

test('v6 moving and rotating a building derives its new complete support plane', () => {
  let state = clone(initial);
  state.inventory.soil = 2;
  state.inventory.wood = 2;
  state = apply(state, fill(state, 1));
  state = apply(state, { type: 'dropProduct', item: 'wood', quantity: 2, ...target });
  state = apply(state, { type: 'useTool', tool: 'hammer', ...target });
  let crate = state.buildings.find((b) => b.kind === 'crate');
  assert.equal(crate.baseElevation, v6EditPlane(1));
  let destination;
  for (let z = 1; z < 36 && !destination; z++)
    for (let x = 1; x < 36 && !destination; x++) {
      const result = G.dispatch(state, { type: 'moveBuilding', buildingId: crate.id, x, z }, 2000);
      if (
        result.ok &&
        result.state.buildings.find((b) => b.id === crate.id).baseElevation === v6EditPlane(0)
      ) {
        destination = result.state;
      }
    }
  assert.ok(destination);
  state = destination;
  state = apply(state, { type: 'rotateBuilding', buildingId: crate.id });
  crate = state.buildings.find((b) => b.id === crate.id);
  assert.equal(crate.baseElevation, v6EditPlane(0));
  roundtrip(state);
});

if (process.env.V6_DOMAIN_METRICS)
  test('v6 warm interaction and checkpoint CPU timings', () => {
    const fs = require('node:fs'),
      path = require('node:path'),
      { performance } = require('node:perf_hooks');
    const measure = (fn, count = 15) => {
      const ms = [];
      for (let i = 0; i < count; i++) {
        const start = performance.now();
        fn();
        ms.push(performance.now() - start);
      }
      ms.sort((a, b) => a - b);
      return {
        count,
        medianMs: ms[Math.floor(ms.length / 2)],
        p95Ms: ms[Math.min(ms.length - 1, Math.ceil(ms.length * 0.95) - 1)],
        maxMs: ms.at(-1),
      };
    };
    const dig = command(initial, 'dig', 0),
      dry = clone(initial);
    dry.inventory.soil = 1;
    const failed = fill(dry, 64);
    assert.equal(G.previewTerrain6Edit(dry, failed).allowed, false);
    let many = clone(initial);
    many.trees = [];
    for (let z = 40; z < 140 && many.terrain6.cells.length < 64; z++)
      for (let x = 40; x < 140 && many.terrain6.cells.length < 64; x++) {
        if (!G.getV6EditSurface(many).world.at(x, z)) continue;
        many.inventory.soil = 15;
        const level = G.terrain6EditLevel(many, x, z, 'fill');
        if (level === null) continue;
        const cmd = { ...fill(many, level), x, z };
        const result = G.dispatch(many, cmd, many.lastSeenAt + 1);
        if (result.ok) many = result.state;
      }
    assert.equal(many.terrain6.cells.length, 64);
    const bytes = G.exportSave(many);
    const result = {
      seed: 1937,
      worldPreparationExcluded: true,
      quanta: 4096,
      checkpointCells: many.terrain6.cells.length,
      checkpointBytes: bytes.length,
      previewSlopeDig: measure(() => G.previewTerrain6Edit(initial, dig)),
      dispatchSlopeDig: measure(() => G.dispatch(initial, dig, 2000)),
      previewFailed64LayerFill: measure(() => G.previewTerrain6Edit(dry, failed)),
      export64Cells: measure(() => G.exportSave(many), 7),
      import64Cells: measure(() => G.importSave(bytes, many.lastSeenAt), 7),
    };
    const file = path.resolve(
      __dirname,
      '../../terrain-v5-lab/terrain6-integration-domain/warm-cpu.json',
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
    console.log('V6_DOMAIN_WARM_CPU', JSON.stringify(result));
  });

test('v6 real generator-valid checkpoint reaches the exact wire limit and rejects a growing terrain edit atomically', () => {
  const { MAX_SAVE_CHARACTERS: limit } = require('../.domain-build/domain/save-limits');
  const { buildingOccupiesCell } = require('../.domain-build/domain/building-cells');
  const state = clone(initial);
  state.inventory.vegetable = 9;
  const world = G.getV6EditSurface(state).world,
    targetLength = limit - 1;
  const resourceMap = new Map(state.naturalResources.map((r) => [`${r.x},${r.z}`, r]));
  const treeMap = new Map(state.trees.map((r) => [`${r.x},${r.z}`, r]));
  const chosen = new Set(),
    cells = [];
  let length = serializedSaveLength(state),
    resourceCount = state.naturalResources.length,
    treeCount = state.trees.length;
  // This is a controlled import-valid checkpoint fixture, not a replay/economy-history claim.
  // Geometry and every protected-cell bound come from the real prepared seed1937 world.
  outer: for (let z = 3; z < 189; z++)
    for (let x = 3; x < 189; x++) {
      if (state.buildings.some((b) => buildingOccupiesCell(b, x, z))) continue;
      let safe = true;
      for (let dz = -2; dz <= 2 && safe; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const c = world.at(x + dx, z + dz),
            h = world.hydrology.at(x + dx, z + dz);
          if (!c || c.reserved || h?.state !== 'dryBuildable' || h.dryLower < 1.8) {
            safe = false;
            break;
          }
        }
      if (!safe) continue;
      const cell = {
          x,
          z,
          initialResourceAmount: 0,
          cutLevel: 0,
          level: 64,
          fills: Array.from({ length: 64 }, (_, i) => ({ level: i + 1, material: 'soil' })),
        },
        key = `${x},${z}`;
      const r = resourceMap.get(key),
        t = treeMap.get(key),
        nextOperation = (cells.length + 1) * 2 + 1;
      let delta =
        JSON.stringify(cell).length +
        (cells.length ? 1 : 0) +
        String(nextOperation).length -
        String(state.terrain6.nextOperation).length;
      if (r) delta -= JSON.stringify(r).length + (resourceCount > 1 ? 1 : 0);
      if (t) delta -= JSON.stringify(t).length + (treeCount > 1 ? 1 : 0);
      if (length + delta > targetLength) break outer;
      length += delta;
      cells.push(cell);
      chosen.add(key);
      state.terrain6.nextOperation = nextOperation;
      if (r) resourceCount--;
      if (t) treeCount--;
    }
  state.terrain6.cells = cells;
  state.naturalResources = state.naturalResources.filter((r) => !chosen.has(`${r.x},${r.z}`));
  state.trees = state.trees.filter((r) => !chosen.has(`${r.x},${r.z}`));
  assert.ok(cells.length > 1500, 'The near-limit fixture exercises real checkpoint scale');
  assert.equal(serializedSaveLength(state), length);
  // Both real materials are legal; each soil→stone label contributes exactly one wire character.
  let gap = targetLength - length;
  for (const c of cells)
    for (const f of c.fills)
      if (gap > 0) {
        f.material = 'stone';
        gap--;
      }
  assert.equal(gap, 0);
  assert.equal(serializedSaveLength(state), targetLength);
  const original = G.exportSave(state);
  assert.equal(original.length, targetLength);
  const accepted = G.dispatch(state, { type: 'buyCrop', item: 'vegetable', quantity: 1 }, 1001);
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(serializedSaveLength(accepted.state), limit);
  const encoded = G.exportSave(accepted.state);
  assert.equal(encoded.length, limit);
  const loaded = G.importSave(encoded, 10000);
  assert.equal(loaded.lastSeenAt, 1001, 'Clock-only growth preserves the valid max-size save');
  assert.equal(G.exportSave(loaded), encoded);
  const first = cells[0],
    before = JSON.stringify(accepted.state),
    rejected = G.dispatch(
      accepted.state,
      {
        type: 'editTerrain6',
        kind: 'dig',
        x: first.x,
        z: first.z,
        level: 63,
        expectedOperation: accepted.state.terrain6.nextOperation,
      },
      1002,
    );
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /存档大小上限/);
  assert.equal(rejected.state, accepted.state);
  assert.equal(JSON.stringify(accepted.state), before);
  assert.equal(accepted.state.nextId, 3);
  assert.equal(accepted.state.terrain6.cells[0].level, 64);
  assert.deepEqual(accepted.state.looseDrops, []);
});
