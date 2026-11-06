const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { MAX_VALUE } = require('../.domain-build/domain/config');
const { createCompostState } = require('../.domain-build/domain/compost');
function town() {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.buildings.push({ id: 'b3', kind: 'crate', x: 9, z: 5, rotation: 0 });
  s.nextId = 4;
  s.inventory = { ...emptyStock(), vegetable: 4, wheat: 2, treeSeed: 2, mud: 1 };
  return s;
}
function run(s, c, now = s.lastSeenAt) {
  const before = g.exportSave(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, true, r.error);
  assert.equal(g.exportSave(s), before);
  assert.deepEqual(g.importSave(g.exportSave(r.state), r.state.lastSeenAt), r.state);
  return r.state;
}
function reject(s, c, now = s.lastSeenAt) {
  const before = JSON.stringify(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
}
const hammer = { type: 'useTool', tool: 'hammer', buildingId: 'b3' };
function barrel() {
  return run(town(), hammer);
}
function inventory(s, item, quantity) {
  return {
    type: 'depositCompost',
    buildingId: 'b3',
    quantity,
    source: { type: 'inventory', item, amount: s.inventory[item] },
  };
}
const dropSnapshot = ({ id, item, amount, x6, z6 }) => ({ id, item, amount, x6, z6 });
test('empty crate hammer becomes a same-ID barrel while mud still makes a nursery', () => {
  const initial = town(),
    s = run(initial, hammer),
    b = s.buildings[2];
  assert.deepEqual(
    { id: b.id, x: b.x, z: b.z, rotation: b.rotation },
    { id: 'b3', x: 9, z: 5, rotation: 0 },
  );
  assert.equal(b.kind, 'compostBarrel');
  assert.deepEqual(b.compost, createCompostState());
  assert.deepEqual(s.inventory, initial.inventory);
  assert.equal(s.fusion.discoveries['build-compost-barrel'].count, 1);
  const mud = run(initial, { type: 'attachMaterial', buildingId: 'b3', item: 'mud', quantity: 1 });
  assert.equal(run(mud, hammer).buildings[2].kind, 'nursery');
  const other = run(initial, {
    type: 'attachMaterial',
    buildingId: 'b3',
    item: 'treeSeed',
    quantity: 1,
  });
  reject(other, hammer);
  reject(s, hammer);
});
test('mixed inventory and explicit ground inputs start one snapshot without hidden supplementation', () => {
  let s = barrel();
  s.groundStacks.push({ x: 10, z: 5, item: 'treeSeed', amount: 3 });
  const first = inventory(s, 'vegetable', 1),
    oldId = s.nextId;
  s = run(s, first);
  assert.equal(s.nextId, oldId);
  assert.equal(s.buildings[2].compost.stock.vegetable, 1);
  const input = {
    type: 'depositCompost',
    buildingId: 'b3',
    quantity: 1,
    source: { type: 'ground', stack: { ...s.groundStacks[0] } },
  };
  s = run(s, input);
  const job = s.buildings[2].compost.job;
  assert.deepEqual(job.inputs, [
    { item: 'vegetable', amount: 1 },
    { item: 'treeSeed', amount: 1 },
  ]);
  assert.equal(s.groundStacks[0].amount, 2);
  assert.equal(s.inventory.treeSeed, 2);
  assert.equal(g.compostOccupied(s.buildings[2].compost), 2);
  reject(s, input);
  reject(s, first);
  assert.equal(s.nextId, oldId + 1);
});
test('actual harvested loose drops can enter a barrel directly, keeping any residue at its exact position', () => {
  let s = barrel();
  s = run(s, { type: 'plantCell', buildingId: 'b2', cell: 0, crop: 'vegetable' });
  s = run(s, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 16000);
  const drop = s.looseDrops[0],
    original = dropSnapshot(drop),
    amount = s.inventory.vegetable;
  const c = {
    type: 'depositCompost',
    buildingId: 'b3',
    quantity: 1,
    source: { type: 'drop', drop: original },
  };
  s = run(s, c);
  assert.equal(s.inventory.vegetable, amount);
  assert.deepEqual(dropSnapshot(s.looseDrops[0]), { ...original, amount: 1 });
  reject(s, c);
  s = run(s, { ...c, source: { type: 'drop', drop: dropSnapshot(s.looseDrops[0]) } });
  assert.equal(s.looseDrops.length, 0);
  assert.equal(s.buildings[2].compost.job.inputs[0].amount, 2);
});
test('bad, stale and oversized sources never debit, split or substitute any material', () => {
  const s = barrel();
  s.groundStacks.push({ x: 10, z: 5, item: 'vegetable', amount: 3 });
  const good = inventory(s, 'vegetable', 1);
  for (const c of [
    { ...good, quantity: 0 },
    { ...good, quantity: 1.5 },
    { ...good, quantity: 17 },
    { ...good, source: { type: 'inventory', item: 'wood', amount: 0 } },
    { ...good, source: { type: 'inventory', item: 'vegetable', amount: 3 } },
    { ...good, source: { type: 'ground', stack: { x: 10, z: 5, item: 'vegetable', amount: 2 } } },
    {
      ...good,
      source: { type: 'ground', stack: { x: 10, z: 5, item: 'vegetable', amount: 3 } },
      quantity: 4,
    },
    {
      ...good,
      source: { type: 'drop', drop: { id: 'd999', item: 'vegetable', amount: 1, x6: 1, z6: 1 } },
    },
    { ...good, source: { type: 'nearest' } },
    { ...good, buildingId: 'b1' },
  ])
    reject(s, c);
});
test('active inputs occupy capacity and overflow preserves source, job, nextId and discoveries', () => {
  let s = barrel();
  s = run(s, inventory(s, 'vegetable', 2));
  const job = structuredClone(s.buildings[2].compost.job);
  s.inventory = { ...emptyStock(), rice: 14, treeSeed: 1 };
  s = run(s, inventory(s, 'rice', 14));
  assert.equal(g.compostOccupied(s.buildings[2].compost), 16);
  assert.deepEqual(s.buildings[2].compost.job, job);
  reject(s, inventory(s, 'treeSeed', 1));
  const ready = g.importSave(g.exportSave(s), job.readyAt + 86400000);
  assert.equal(ready.tools.fertilizer, s.tools.fertilizer);
  assert.equal(ready.buildings[2].compost.job.id, job.id);
});
test('ready output uses finite fertilizer counter and receipt identity without global stock or offline loops', () => {
  let s = barrel();
  s = run(s, inventory(s, 'vegetable', 4));
  const job = s.buildings[2].compost.job,
    c = { type: 'collectCompost', buildingId: 'b3', jobId: job.id };
  reject(s, c, job.readyAt - 1);
  const full = structuredClone(s);
  full.tools.fertilizer = MAX_VALUE;
  reject(full, c, job.readyAt);
  const oldStock = { ...s.inventory },
    beforeFertilizer = s.tools.fertilizer;
  s = run(s, c, job.readyAt + 86400000);
  assert.equal(s.tools.fertilizer, beforeFertilizer + 1);
  assert.deepEqual(s.inventory, oldStock);
  assert.equal(s.buildings[2].compost.job.startedAt, s.lastSeenAt);
  assert.equal(s.buildings[2].compost.job.readyAt, s.lastSeenAt + 15000);
  assert.equal(s.fusion.discoveries['make-fertilizer'].count, 1);
  reject(s, c);
});
test('waiting raw input is reclaimable, but active batch and full global storage remain safe', () => {
  let s = barrel();
  s = run(s, inventory(s, 'treeSeed', 1));
  const c = { type: 'withdrawCompostInput', buildingId: 'b3', item: 'treeSeed', quantity: 1 };
  const full = structuredClone(s);
  full.inventory.wood += g.getCapacity(full) - g.getUsedStorage(full);
  reject(full, c);
  s = run(s, c);
  assert.equal(s.inventory.treeSeed, 2);
  reject(s, c);
  s = run(s, inventory(s, 'wheat', 2));
  reject(s, { ...c, item: 'wheat' });
});
test('move, rotation, clock rollback and balancing preserve deep-snapshotted promises', () => {
  let s = barrel();
  s = run(s, inventory(s, 'vegetable', 2));
  const old = s.buildings[2].compost,
    job = old.job;
  s = run(s, { type: 'rotateBuilding', buildingId: 'b3' }, 0);
  assert.notEqual(s.buildings[2].compost, old);
  assert.notEqual(s.buildings[2].compost.job.inputs, job.inputs);
  s = run(s, { type: 'moveBuilding', buildingId: 'b3', x: 9, z: 6 });
  const balance = { ...g.COMPOST_BALANCE };
  try {
    g.COMPOST_BALANCE.durationMs = 30000;
    g.COMPOST_BALANCE.fertilizerYield = 5;
    s = g.importSave(g.exportSave(s), job.readyAt);
    const oldCount = s.tools.fertilizer;
    s = run(s, { type: 'collectCompost', buildingId: 'b3', jobId: job.id });
    assert.equal(s.tools.fertilizer, oldCount + 1);
  } finally {
    Object.assign(g.COMPOST_BALANCE, balance);
  }
});
test('new-job ID exhaustion does not consume input or collected output', () => {
  const s = barrel();
  s.nextId = MAX_VALUE;
  reject(s, inventory(s, 'vegetable', 2));
  let busy = barrel();
  busy = run(busy, inventory(busy, 'vegetable', 4));
  busy.nextId = MAX_VALUE;
  const job = busy.buildings[2].compost.job;
  reject(busy, { type: 'collectCompost', buildingId: 'b3', jobId: job.id }, job.readyAt);
});
