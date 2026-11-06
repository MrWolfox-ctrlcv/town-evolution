const { hammerAssemblyCommand } = require('./helpers/hammer-assembly.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looseAmount, pickupDrops } = require('./helpers/loose-output.cjs');
const g = require('../.domain-build/domain/game.js');
const { populateIslandTrees } = require('../.domain-build/domain/island.js');
const { blocksDockWater } = require('../.domain-build/domain/expansion.js');
const { townSession, DEMO_REVISION_KEY } = require('../.domain-build/application/TownProfiles.js');
const { SAVE_KEY } = require('../.domain-build/domain/storage.js');
const NOW = 100000;
function run(s, command, now = s.lastSeenAt) {
  const before = g.exportSave(s);
  const result = g.dispatch(s, command, now);
  assert.equal(result.ok, true, result.error);
  assert.equal(g.exportSave(s), before);
  return g.importSave(g.exportSave(result.state), result.state.lastSeenAt);
}
function rejects(s, command) {
  const before = g.exportSave(s);
  const result = g.dispatch(s, command, s.lastSeenAt);
  assert.equal(result.ok, false);
  assert.equal(result.state, s);
  assert.equal(g.exportSave(s), before);
}
function mergePair(s, irrigated) {
  const fields = s.buildings.filter(
    (b) => b.kind === 'farm' && !b.farmSize && Boolean(b.irrigated) === irrigated,
  );
  for (const a of fields)
    for (const b of fields) {
      try {
        return { sourceId: a.id, targetId: b.id, plan: g.farmMergePreview(s, a.id, b.id) };
      } catch {}
    }
  throw Error('Demo is missing an immediately mergeable three-field plot');
}
function shore(s) {
  for (let z = 1; z < g.CONFIG.gridSize - 1; z++)
    for (let x = 1; x < g.CONFIG.gridSize - 1; x++) {
      const land = (x, z) => g.isLandCell(x, z, s.mapSeed, s.terrainVersion, s.landExtensions);
      if (
        !land(x, z) &&
        !blocksDockWater({ x, z }, s.buildings) &&
        [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(([dx, dz]) => land(x + dx, z + dz))
      )
        return { x, z };
    }
  throw Error('No playable reclamation shore');
}

test('default v4 demo displays every active item and all compatible buildings without fake river bridges', () => {
  const s = g.createDemoGame(NOW);
  assert.equal(s.terrainVersion, 4);
  for (const item of g.ITEM_KEYS.filter((item) => item !== 'chilledVegetable')) {
    assert.ok(s.inventory[item] > 0, `${item} available in stock`);
    assert.ok(
      s.groundStacks.some((p) => p.item === item),
      `${item} has a real interactive pile`,
    );
  }
  for (const kind of Object.keys(g.CONFIG.buildings).filter(
    (k) => !['cooler', 'coldWarehouse', 'woodenBridge'].includes(k),
  ))
    assert.ok(
      s.buildings.some((b) => b.kind === kind),
      kind,
    );
  assert.equal(s.inventory.chilledVegetable, 0);
  assert.ok(!s.buildings.some((b) => ['cooler', 'coldWarehouse'].includes(b.kind)));
  assert.ok(!s.buildings.some((b) => b.kind === 'woodenBridge'));
  const biomes = new Set();
  for (let z = 0; z < g.CONFIG.gridSize; z++)
    for (let x = 0; x < g.CONFIG.gridSize; x++) {
      const cell = g.terrainAt(x, z, s.mapSeed, s.terrainVersion, s.landExtensions);
      if (cell) biomes.add(cell.biome);
    }
  assert.deepEqual([...biomes].sort(), ['forest', 'hill', 'mountain', 'plain']);
  assert.deepEqual([...new Set(s.naturalResources.map((r) => r.kind))].sort(), ['soil', 'stone']);
  assert.equal(s.landExtensions.length, 1);
  for (const size of [3, 6])
    for (const water of [false, true])
      assert.ok(
        s.buildings.some(
          (b) => b.kind === 'farm' && g.farmGridSize(b) === size && Boolean(b.irrigated) === water,
        ),
      );
  for (const tool of g.ACTIVE_TOOLS) assert.ok(s.tools[tool] > 0);
  assert.ok(!g.ACTIVE_TOOLS.includes('fertilizer'));
  assert.ok(
    g.getCapacity(s) - g.getUsedStorage(s) >= 40,
    'Room for actual harvesting, collecting and gathering',
  );
});

test('v4 and isolated v5 demos together expose every active building through real playable assembly', () => {
  const ordinary = g.createDemoGame(NOW),
    ordinarySave = g.exportSave(ordinary),
    demonstrated = new Set(ordinary.buildings.map((b) => b.kind));
  for (const reverse of [false, true]) {
    const state = g.createBridgeDemo(NOW),
      before = g.exportSave(state),
      piers = state.buildings.filter((b) => b.kind === 'woodenPier');
    assert.equal(state.schemaVersion, 10);
    assert.equal(state.terrainVersion, 5);
    assert.equal(piers.length, 2, 'The teaching island provides the two actual input entities');
    assert.ok(!state.buildings.some((b) => b.kind === 'woodenBridge'));
    assert.equal(state.fusion.discoveries['build-wooden-bridge'], undefined);
    const selected = (reverse ? [...piers].reverse() : piers).map(
      ({ id, kind, x, z, rotation }) => ({ id, kind, x, z, rotation }),
    );
    const crossing = g.bridgeCrossingPlan(state, selected);
    assert.equal(crossing.endpointCells.length, 8);
    assert.ok(crossing.riverCells.length >= 4, 'The bridge crosses a real two-cell-wide river');
    for (const { x, z } of crossing.endpointCells)
      assert.equal(g.isLandCell(x, z, state.mapSeed, 5, state.landExtensions), true);
    for (const { x, z } of crossing.riverCells)
      assert.equal(g.isLandCell(x, z, state.mapSeed, 5, state.landExtensions), false);
    const command = {
      type: 'dragMerge',
      sourceId: selected[0].id,
      targetId: selected[1].id,
      sources: selected,
    };
    rejects(state, { ...command, sources: undefined });
    const result = run(state, command),
      bridge = result.buildings.find((b) => b.kind === 'woodenBridge');
    assert.ok(bridge, 'Actual dispatch, rather than an injected placeholder, creates the bridge');
    assert.equal(bridge.id, crossing.retainedId);
    assert.equal(bridge.bridge.length, crossing.length);
    assert.deepEqual(
      new Set(bridge.bridge.piers.map((p) => p.id)),
      new Set(piers.map((p) => p.id)),
    );
    assert.equal(result.buildings.length, state.buildings.length - 1);
    assert.ok(!result.buildings.some((b) => b.id === crossing.consumedId));
    assert.equal(result.fusion.discoveries['build-wooden-bridge'].count, 1);
    assert.equal(result.nextId, state.nextId);
    assert.equal(result.coins, state.coins);
    for (const key of [
      'inventory',
      'tools',
      'trees',
      'naturalResources',
      'groundStacks',
      'looseDrops',
      'landExtensions',
    ])
      assert.deepEqual(result[key], state[key], `${key} survives teaching-island assembly`);
    rejects(result, command);
    assert.equal(g.exportSave(state), before);
    assert.equal(g.exportSave(ordinary), ordinarySave, 'The default demo is never upgraded');
    for (const building of result.buildings) demonstrated.add(building.kind);
  }
  assert.deepEqual(
    [...demonstrated].sort(),
    Object.keys(g.CONFIG.buildings)
      .filter((kind) => !['cooler', 'coldWarehouse'].includes(kind))
      .sort(),
    'Every supported non-legacy building remains covered across valid demo worlds',
  );
});

test('large demo fields show three stages of compatible crops while small water practice fields stay empty', () => {
  const farms = g.createDemoGame(NOW).buildings.filter((b) => b.kind === 'farm');
  for (const b of farms.filter((b) => b.irrigated && b.farmSize !== 6))
    assert.deepEqual(b.cropJobs, Array(g.farmCellCount(b)).fill(null));
  for (const b of farms.filter((b) => b.farmSize === 6)) {
    const crops = g.CROP_KEYS.filter(
      (crop) => g.CROPS[crop].field === (b.irrigated ? 'water' : 'dry'),
    );
    assert.equal(b.cropJobs.length, 36);
    assert.equal(b.cropJobs.filter((j) => !j).length, 27);
    assert.ok(b.cropJobs.filter(Boolean).every((job) => crops.includes(job.crop)));
    for (const crop of crops) {
      const jobs = b.cropJobs.filter((j) => j?.crop === crop);
      assert.equal(jobs.length, 9 / crops.length);
      assert.deepEqual(
        jobs.map((j) => (NOW - j.startedAt) / j.durationMs),
        [1, 0.5, 0].flatMap((stage) => Array(3 / crops.length).fill(stage)),
      );
    }
  }
});

for (const irrigated of [false, true])
  test(`demo ${irrigated ? 'water' : 'dry'} field trio merges without clearing or moving unrelated content`, () => {
    const s = g.createDemoGame(NOW);
    const { sourceId, targetId, plan } = mergePair(s, irrigated);
    const result = run(s, { type: 'dragMerge', sourceId, targetId });
    const merged = result.buildings.find((b) => b.id === targetId);
    assert.equal(merged.farmSize, 6);
    assert.equal(Boolean(merged.irrigated), irrigated);
    assert.deepEqual(merged.cropJobs, plan.building.cropJobs);
    assert.equal(merged.cropJobs.filter(Boolean).length, irrigated ? 0 : 9);
    assert.deepEqual(result.trees, s.trees);
    assert.deepEqual(result.groundStacks, s.groundStacks);
    assert.deepEqual(result.naturalResources, s.naturalResources);
    rejects(result, { type: 'dragMerge', sourceId, targetId });
  });

test('demo dry fields grow normally and must be fully harvested before irrigation', () => {
  let s = g.createDemoGame(NOW);
  const field = s.buildings.find((b) => b.farmSize === 6 && !b.irrigated);
  rejects(s, { type: 'useTool', tool: 'wateringCan', buildingId: field.id });
  s = run(s, { type: 'harvestCell', buildingId: field.id, cell: 0 });
  rejects(s, { type: 'plantCell', buildingId: field.id, cell: 0, crop: 'wheat' });
  s = pickupDrops(
    s,
    (drop) =>
      drop.source.type === 'crop' && drop.source.buildingId === field.id && drop.source.cell === 0,
  );
  s = run(s, { type: 'plantCell', buildingId: field.id, cell: 0, crop: 'wheat' });
  rejects(s, { type: 'harvestCell', buildingId: field.id, cell: 0 });
  s = run(
    s,
    { type: 'harvestCell', buildingId: field.id, cell: 0 },
    NOW + g.CROPS.wheat.durationMs,
  );
  assert.equal(s.buildings.find((b) => b.id === field.id).cropJobs[0], null);
  rejects(s, { type: 'useTool', tool: 'wateringCan', buildingId: field.id });
  for (let cell = 1; cell < 9; cell++)
    s = run(s, { type: 'harvestCell', buildingId: field.id, cell });
  s = run(s, { type: 'useTool', tool: 'wateringCan', buildingId: field.id });
  rejects(s, { type: 'plantCell', buildingId: field.id, cell: 0, crop: 'wheat' });
  assert.ok(s.buildings.find((b) => b.id === field.id).cropJobs.every((job) => !job));
});

test('demo has enough soil and mud for independent real conversion, residence and coast expansion', () => {
  let s = g.createDemoGame(NOW);
  const sources = s.groundStacks.filter((p) => p.item === 'soil').map(({ x, z }) => ({ x, z }));
  assert.equal(sources.length, 2);
  const water = { type: 'useTool', tool: 'wateringCan', ...sources[0], sources };
  s = run(s, water);
  assert.ok(!s.groundStacks.some((p) => p.item === 'soil'));
  assert.ok(
    s.groundStacks.some(
      (p) => p.item === 'mud' && p.amount === 1 && p.x === sources[0].x && p.z === sources[0].z,
    ),
  );
  rejects(s, water);
  const house = s.buildings.find((b) => b.kind === 'house');
  const source = s.groundStacks.find((p) => p.item === 'mud' && p.amount === 1);
  rejects(s, { type: 'buildResidence', buildingId: house.id, source });
  s = run(s, {
    type: 'attachMaterial',
    buildingId: house.id,
    item: 'mud',
    quantity: 1,
    source: { ...source },
  });
  assert.equal(s.buildings.find((b) => b.id === house.id).kind, 'house');
  s = run(s, { type: 'useTool', tool: 'hammer', buildingId: house.id });
  assert.equal(s.buildings.find((b) => b.id === house.id).kind, 'residence');
  const mud = s.groundStacks.find((p) => p.item === 'mud' && p.amount === 9);
  const target = shore(s);
  const command = { type: 'expandLand', fromX: mud.x, fromZ: mud.z, ...target };
  s = run(s, command);
  assert.equal(s.landExtensions.length, 2);
  assert.ok(g.isLandCell(target.x, target.z, s.mapSeed, s.terrainVersion, s.landExtensions));
  rejects(s, command);
  s = run(s, { type: 'dropProduct', item: 'stone', ...target });
  assert.ok(s.groundStacks.some((p) => p.x === target.x && p.z === target.z));
});

test('demo prebuilt pieces support every active house upgrade and warehouse expansion', () => {
  let s = g.createDemoGame(NOW);
  const houses = s.buildings.filter((b) => b.kind === 'house');
  const crate = s.buildings.find((b) => b.kind === 'crate');
  const board = s.buildings.find((b) => b.kind === 'orderBoard');
  rejects(s, { type: 'dragMerge', sourceId: crate.id, targetId: houses[0].id });
  s = run(s, hammerAssemblyCommand(s, [crate.id, houses[0].id]));
  rejects(s, { type: 'dragMerge', sourceId: board.id, targetId: houses[1].id });
  s = run(s, hammerAssemblyCommand(s, [board.id, houses[1].id]));
  rejects(s, { type: 'buildResidence', buildingId: houses[2].id });
  s = run(s, { type: 'attachMaterial', buildingId: houses[2].id, item: 'mud', quantity: 1 });
  assert.equal(s.buildings.find((b) => b.id === houses[2].id).kind, 'house');
  s = run(s, { type: 'useTool', tool: 'hammer', buildingId: houses[2].id });
  s = run(s, { type: 'attachMaterial', buildingId: houses[0].id, item: 'wood', quantity: 2 });
  s = run(s, { type: 'useTool', tool: 'hammer', buildingId: houses[0].id });
  assert.equal(s.buildings.find((b) => b.id === houses[0].id).kind, 'expandedWarehouse');
  assert.equal(s.buildings.find((b) => b.id === houses[1].id).kind, 'shop');
  assert.equal(s.buildings.find((b) => b.id === houses[2].id).kind, 'residence');
  assert.equal(s.coins, 1000);
});

test('demo reserves a usable digging plot and permits natural-resource collection and paid tree planting', () => {
  let s = g.createDemoGame(NOW);
  for (const kind of ['stone', 'soil']) {
    const resource = s.naturalResources.find((r) => r.kind === kind);
    const before = s.inventory[kind];
    s = run(s, { type: 'gatherNatural', resourceId: resource.id });
    assert.equal(s.inventory[kind], before);
    assert.equal(looseAmount(s, kind), kind === 'soil' ? 9 : 1);
    s = pickupDrops(
      s,
      (drop) => drop.source.type === 'natural' && drop.source.resourceId === resource.id,
    );
    assert.equal(s.inventory[kind], before + (kind === 'soil' ? 9 : 1));
  }
  // The dedicated practice plot is adjacent to the original farm and storehouse.
  s = run(s, { type: 'useTool', tool: 'diggingTool', x: 5, z: 5 });
  assert.ok(s.buildings.some((b) => b.kind === 'farm' && b.x === 5 && b.z === 5));
  const tree = s.trees[0];
  s = run(s, { type: 'useTool', tool: 'axe', treeId: tree.id });
  const seeds = s.inventory.treeSeed,
    coins = s.coins;
  s = run(s, { type: 'placeTree', x: tree.x, z: tree.z });
  assert.equal(
    s.inventory.treeSeed,
    seeds,
    'Legacy paid planting remains independent of nursery seed and sapling consumption',
  );
  assert.equal(s.coins, coins - g.FOUNDATION.treePrice);
  assert.ok(s.trees.some((t) => t.x === tree.x && t.z === tree.z && t.id !== tree.id));
});

test('new-tree generation respects the full large-field footprint and its margin', () => {
  const s = g.createDemoGame(NOW);
  s.trees = [];
  populateIslandTrees(s, 1000);
  for (const b of s.buildings.filter((b) => b.farmSize === 6))
    assert.ok(
      !s.trees.some((t) => t.x >= b.x - 1 && t.x < b.x + 5 && t.z >= b.z - 1 && t.z < b.z + 5),
    );
  assert.deepEqual(g.importSave(g.exportSave(s), NOW), s);
});

test('demo revision preserves played farms, resources and extension changes until explicit isolated reset', () => {
  const data = new Map();
  const store = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  const normal = townSession(store, 'normal', () => NOW);
  assert.ok(normal.save());
  const normalSave = store.getItem(SAVE_KEY);
  const demo = townSession(store, 'demo', () => NOW);
  const soil = demo.state.groundStacks.filter((p) => p.item === 'soil');
  demo.state = run(demo.state, {
    type: 'useTool',
    tool: 'wateringCan',
    x: soil[0].x,
    z: soil[0].z,
    sources: soil,
  });
  assert.ok(demo.save());
  const before = store.getItem(`town-evolution.demo.${SAVE_KEY}`);
  store.setItem(DEMO_REVISION_KEY, 'older-played-demo');
  const restored = townSession(store, 'demo', () => NOW);
  assert.equal(store.getItem(`town-evolution.demo.${SAVE_KEY}`), before);
  assert.deepEqual(restored.state, demo.state);
  assert.match(restored.message, /模板已更新/);
  assert.ok(restored.reset());
  assert.deepEqual(restored.state, g.createDemoGame(NOW));
  assert.equal(store.getItem(SAVE_KEY), normalSave);
});

for (const now of [0, 1, 14999, 30000])
  test(`full demo remains a valid, deterministic save at time ${now}`, () => {
    const s = g.createDemoGame(now);
    assert.deepEqual(g.importSave(g.exportSave(s), now), s);
    assert.deepEqual(g.createDemoGame(now), s);
    assert.ok(
      s.buildings
        .flatMap((b) => b.cropJobs ?? [])
        .filter(Boolean)
        .every((j) => j.startedAt >= 0),
    );
  });
