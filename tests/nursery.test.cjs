const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game.js');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
const { MAX_TIME, MAX_VALUE } = require('../.domain-build/domain/config.js');
const {
  NURSERY,
  isTreeMature,
  nurseryStage,
  treeGrowthProgress,
} = require('../.domain-build/domain/nursery.js');

function town() {
  const s = g.createGame(1000, 1, 2);
  s.trees = [];
  s.naturalResources = [];
  s.buildings.push({ id: 'b3', kind: 'crate', x: 10, z: 12, rotation: 1 });
  s.nextId = 4;
  s.inventory.mud = 2;
  s.inventory.treeSeed = 2;
  return s;
}
function run(s, command, now = s.lastSeenAt) {
  const result = g.dispatch(s, command, now);
  assert.equal(result.ok, true, result.error);
  return result.state;
}
function rejects(s, command, now = s.lastSeenAt) {
  const before = JSON.stringify(s);
  const result = g.dispatch(s, command, now);
  assert.equal(result.ok, false);
  assert.equal(result.state, s);
  assert.equal(JSON.stringify(s), before);
  return result.error;
}
function nursery(s = town()) {
  s = run(s, { type: 'attachMaterial', buildingId: 'b3', item: 'mud', quantity: 1 });
  assert.equal(s.buildings[2].kind, 'crate');
  return run(s, { type: 'useTool', tool: 'hammer', buildingId: 'b3' });
}
function watered(s = nursery(), now = s.lastSeenAt) {
  s = run(s, { type: 'seedNursery', buildingId: 'b3' }, now);
  return run(s, { type: 'useTool', tool: 'wateringCan', buildingId: 'b3' }, now);
}

test('nursery spends exactly one mud, retains crate identity and unrelated attachments', () => {
  for (const ground of [false, true]) {
    const s = town();
    s.inventory.soil = 2;
    s.fusion.attachments.b3 = { ...emptyStock(), wood: 2 };
    s.groundStacks = [{ x: 10, z: 10, item: 'mud', amount: 9 }];
    const command = {
      type: 'attachMaterial',
      buildingId: 'b3',
      item: 'mud',
      quantity: 1,
      ...(ground ? { source: { ...s.groundStacks[0] } } : {}),
    };
    rejects(s, { type: 'buildNursery', buildingId: 'b3' });
    rejects(s, { type: 'useTool', tool: 'hammer', buildingId: 'b3' });
    const staged = run(s, command);
    assert.deepEqual(staged.buildings, s.buildings);
    assert.equal(staged.fusion.attachments.b3.mud, 1);
    assert.equal(staged.fusion.discoveries['build-nursery'], undefined);
    const hammer = { type: 'useTool', tool: 'hammer', buildingId: 'b3' };
    const next = run(staged, hammer);
    assert.deepEqual(next.buildings[2], { ...s.buildings[2], kind: 'nursery' });
    assert.equal(next.inventory.mud, ground ? 2 : 1);
    assert.equal(next.inventory.soil, 2);
    assert.equal(next.groundStacks[0].amount, ground ? 8 : 9);
    assert.deepEqual(next.fusion.attachments, s.fusion.attachments);
    assert.equal(g.getCapacity(next), g.getCapacity(s));
    assert.deepEqual(g.importSave(g.exportSave(next), next.lastSeenAt), next);
    rejects(next, hammer);
    if (ground) rejects(next, command);
  }
});

test('nursery rejects wrong buildings, missing mud and malformed or mismatched sources atomically', () => {
  const s = town();
  s.inventory.mud = 0;
  s.inventory.soil = 5;
  // Missing mud plus unrelated attachments is invalid; an empty crate can become compost.
  s.fusion.attachments.b3 = { ...emptyStock(), wood: 1 };
  s.groundStacks = [{ x: 10, z: 10, item: 'soil', amount: 5 }];
  for (const command of [
    { type: 'buildNursery', buildingId: 'b3' },
    { type: 'buildNursery', buildingId: 'b1' },
    { type: 'buildNursery', buildingId: 'missing' },
    { type: 'buildNursery', buildingId: 'b3', source: null },
    { type: 'buildNursery', buildingId: 'b3', source: { x: -1, z: 10 } },
    { type: 'buildNursery', buildingId: 'b3', source: { x: 10, z: 10 } },
    { type: 'useTool', tool: 'hammer', buildingId: 'b3' },
    { type: 'useTool', tool: 'hammer', buildingId: 'missing' },
  ])
    rejects(s, command);
  const staging = { type: 'attachMaterial', buildingId: 'b3', item: 'mud', quantity: 1 };
  rejects(s, staging);
  for (const source of [
    null,
    { x: -1, z: 10 },
    { x: 10, z: 10 },
    { ...s.groundStacks[0] },
    { x: 10, z: 10, item: 'mud', amount: 5 },
  ])
    rejects(s, { ...staging, source });
  s.inventory.mud = 1;
  rejects(s, { ...staging, buildingId: 'missing' });
  const wrongBuilding = run(s, { ...staging, buildingId: 'b1' });
  rejects(wrongBuilding, { type: 'useTool', tool: 'hammer', buildingId: 'b1' });
});

test('nursery requires explicit seed then water and can repeat without replacing the crate', () => {
  let s = nursery();
  const box = () => s.buildings.find((b) => b.id === 'b3');
  assert.equal(nurseryStage(box(), s.lastSeenAt), 'empty');
  rejects(s, { type: 'useTool', tool: 'wateringCan', buildingId: 'b3' });
  rejects(s, { type: 'collect', buildingId: 'b3' });
  for (let round = 0; round < 2; round++) {
    s = run(s, { type: 'seedNursery', buildingId: 'b3' });
    assert.equal(nurseryStage(box(), s.lastSeenAt), 'seeded');
    rejects(s, { type: 'seedNursery', buildingId: 'b3' });
    rejects(s, { type: 'collect', buildingId: 'b3' });
    s = run(s, { type: 'useTool', tool: 'wateringCan', buildingId: 'b3' });
    assert.equal(nurseryStage(box(), s.lastSeenAt), 'growing');
    rejects(s, { type: 'useTool', tool: 'wateringCan', buildingId: 'b3' });
    rejects(s, { type: 'collect', buildingId: 'b3' }, box().job.readyAt - 1);
    const deadline = box().job.readyAt;
    assert.equal(nurseryStage(box(), deadline), 'ready');
    s = run(s, { type: 'collect', buildingId: 'b3' }, deadline);
    assert.equal(nurseryStage(box(), deadline), 'empty');
    assert.equal(s.inventory.sapling, round + 1);
    assert.equal(box().job, undefined);
    assert.equal(box().nurserySeeded, undefined);
    rejects(s, { type: 'collect', buildingId: 'b3' });
  }
  assert.equal(s.inventory.treeSeed, 0);
  assert.equal(s.buildings.filter((b) => b.kind === 'nursery').length, 1);
});

test('ground seed uses one unit, survives movement and offline return without awarding twice', () => {
  let s = nursery();
  s.groundStacks.push({ x: 10, z: 10, item: 'treeSeed', amount: 5 });
  s = run(s, { type: 'seedNursery', buildingId: 'b3', source: { x: 10, z: 10 } });
  assert.equal(s.groundStacks[0].amount, 4);
  assert.equal(s.inventory.treeSeed, 2);
  s = run(s, { type: 'useTool', tool: 'wateringCan', buildingId: 'b3' }, 2000);
  const job = { ...s.buildings[2].job };
  s = run(s, { type: 'moveBuilding', buildingId: 'b3', x: 12, z: 12 }, 3000);
  assert.deepEqual(s.buildings[2].job, job);
  s = g.importSave(g.exportSave(s), job.readyAt + 60_000);
  assert.equal(s.inventory.sapling, 0);
  assert.deepEqual(s.buildings[2].job, job);
  s = run(s, { type: 'collect', buildingId: 'b3' });
  assert.equal(s.inventory.sapling, 1);
  rejects(s, { type: 'collect', buildingId: 'b3' });
});

test('full storage retains the entire ready nursery job and a later retry collects once', () => {
  let s = watered();
  const deadline = s.buildings[2].job.readyAt;
  s.inventory.wood += g.getCapacity(s) - g.getUsedStorage(s);
  rejects(s, { type: 'collect', buildingId: 'b3' }, deadline);
  assert.equal(s.buildings[2].nurserySeeded, true);
  s = run(s, { type: 'dropProduct', item: 'wood', x: 10, z: 10 }, deadline);
  s = run(s, { type: 'collect', buildingId: 'b3' });
  assert.equal(s.inventory.sapling, 1);
  assert.equal(g.getUsedStorage(s), g.getCapacity(s));
});

test('one sapling becomes a growing tree, cannot be chopped early, and matures at the exact boundary', () => {
  let s = town();
  s.inventory.sapling = 2;
  s = run(s, { type: 'plantSapling', x: 10, z: 10 }, 2000);
  const tree = s.trees[0];
  assert.equal(s.inventory.sapling, 1);
  assert.equal(tree.readyAt, 2000 + NURSERY.treeDurationMs);
  assert.equal(treeGrowthProgress(tree, 1000), 0);
  assert.equal(treeGrowthProgress(tree, 2000 + NURSERY.treeDurationMs / 2), 0.5);
  assert.equal(treeGrowthProgress(tree, tree.readyAt + 1), 1);
  assert.equal(isTreeMature(tree, tree.readyAt - 1), false);
  assert.equal(isTreeMature(tree, tree.readyAt), true);
  rejects(s, { type: 'useTool', tool: 'axe', treeId: tree.id }, tree.readyAt - 1);
  s = run(s, { type: 'useTool', tool: 'axe', treeId: tree.id }, tree.readyAt);
  assert.equal(s.trees.length, 0);
  assert.equal(s.inventory.wood, 2);
  assert.equal(s.inventory.treeSeed, 4);
  rejects(s, { type: 'useTool', tool: 'axe', treeId: tree.id });
});

test('ground saplings retain their remainder and allow planting their own cell only when cleared', () => {
  let s = town();
  s.groundStacks.push({ x: 10, z: 10, item: 'sapling', amount: 2 });
  rejects(s, { type: 'plantSapling', x: 10, z: 10, source: { x: 10, z: 10 } });
  s = run(s, { type: 'plantSapling', x: 11, z: 10, source: { x: 10, z: 10 } });
  assert.equal(s.groundStacks[0].amount, 1);
  assert.equal(s.inventory.sapling, 0);
  s = run(s, { type: 'plantSapling', x: 10, z: 10, source: { x: 10, z: 10 } });
  assert.equal(s.groundStacks.length, 0);
  assert.equal(s.trees.length, 2);
  assert.notEqual(s.trees[0].id, s.trees[1].id);
});

test('occupied, malformed, out-of-bounds and water planting leaves the sapling untouched', () => {
  const s = town();
  s.inventory.sapling = 5;
  s.trees.push({ id: 't1', x: 11, z: 10 });
  s.nextTreeId = 2;
  s.groundStacks.push({ x: 12, z: 10, item: 'wood', amount: 1 });
  for (const point of [
    { x: 3, z: 3 },
    { x: 11, z: 10 },
    { x: 12, z: 10 },
    { x: -1, z: 10 },
    { x: 10.5, z: 10 },
    { x: 0, z: 0 },
    { x: NaN, z: 10 },
  ])
    rejects(s, { type: 'plantSapling', ...point });
  rejects(s, { type: 'plantSapling', x: 10, z: 10, source: null });
  rejects(s, { type: 'plantSapling', x: 10, z: 10, source: { x: 12, z: 10 } });
  rejects(s, { type: 'plantSapling', x: 10, z: 10 }, MAX_TIME);
  s.nextTreeId = MAX_VALUE;
  rejects(s, { type: 'plantSapling', x: 10, z: 10 });
});

test('running nursery and tree snapshots retain their deadlines and yields after balance changes', () => {
  let s = watered();
  s.inventory.sapling = 1;
  s = run(s, { type: 'plantSapling', x: 10, z: 10 });
  const saved = g.exportSave(s),
    original = { ...NURSERY };
  try {
    NURSERY.durationMs *= 2;
    NURSERY.yield = 2;
    NURSERY.treeDurationMs *= 2;
    s = g.importSave(saved, s.trees[0].readyAt);
    assert.equal(s.trees[0].growthDurationMs, original.treeDurationMs);
    assert.equal(isTreeMature(s.trees[0], s.lastSeenAt), true);
    assert.equal(s.buildings[2].job.durationMs, original.durationMs);
    s = run(s, { type: 'collect', buildingId: 'b3' });
    assert.equal(s.inventory.sapling, original.yield);
  } finally {
    Object.assign(NURSERY, original);
  }
});

test('legacy version-eight saves add no seedlings and keep original trees immediately mature', () => {
  const s = town();
  s.trees.push({ id: 't1', x: 10, z: 10 });
  s.nextTreeId = 2;
  s.fusion.attachments.b3 = { ...emptyStock(), wood: 1 };
  const raw = JSON.parse(g.exportSave(s));
  raw.schemaVersion = 8;
  delete raw.inventory.sapling;
  delete raw.fusion.attachments.b3.sapling;
  const migrated = g.importSave(JSON.stringify(raw), 5000);
  assert.equal(migrated.inventory.sapling, 0);
  assert.equal(migrated.fusion.attachments.b3.sapling, 0);
  assert.deepEqual(migrated.trees, s.trees);
  assert.equal(isTreeMature(migrated.trees[0], 0), true);
  assert.equal(treeGrowthProgress(migrated.trees[0], 0), 1);
  const chopped = run(migrated, { type: 'useTool', tool: 'axe', treeId: 't1' });
  assert.equal(chopped.inventory.wood, 2);
});

test('malformed nursery jobs and partial or inconsistent growth timestamps reject without repair', () => {
  let s = watered();
  s.inventory.sapling = 1;
  s = run(s, { type: 'plantSapling', x: 10, z: 10 });
  const raw = g.exportSave(s);
  const cases = [
    (data) => delete data.trees[0].plantedAt,
    (data) => delete data.trees[0].readyAt,
    (data) => delete data.trees[0].growthDurationMs,
    (data) => (data.trees[0].plantedAt = data.lastSeenAt + 1),
    (data) => (data.trees[0].readyAt = data.trees[0].plantedAt),
    (data) => data.trees[0].readyAt++,
    (data) => (data.trees[0].growthDurationMs = -1),
    (data) => (data.buildings[0].nurserySeeded = true),
    (data) => (data.buildings[2].nurserySeeded = false),
    (data) => delete data.buildings[2].nurserySeeded,
    (data) => (data.buildings[2].job.yield = 0),
    (data) => data.buildings[2].job.readyAt++,
  ];
  for (const mutate of cases) {
    const data = JSON.parse(raw);
    mutate(data);
    assert.throws(() => g.importSave(JSON.stringify(data), s.lastSeenAt));
  }
});

test('unlimited watering and axe still work at saved zero durability and clock rollback never regresses', () => {
  let s = nursery();
  s.tools.wateringCan = 0;
  s.tools.axe = 0;
  s = watered(s, 5000);
  s = run(s, { type: 'collect', buildingId: 'b3' }, s.buildings[2].job.readyAt);
  s = run(s, { type: 'plantSapling', x: 10, z: 10 }, 0);
  assert.equal(s.trees[0].plantedAt, s.lastSeenAt);
  s = g.advance(s, s.trees[0].readyAt);
  s = run(s, { type: 'useTool', tool: 'axe', treeId: s.trees[0].id }, 0);
  assert.equal(s.trees.length, 0);
  assert.equal(s.tools.wateringCan, 0);
  assert.equal(s.tools.axe, 0);
});
