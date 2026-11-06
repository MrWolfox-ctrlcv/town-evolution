const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { MAX_TIME, MAX_VALUE } = require('../.domain-build/domain/config');
function town(kind = 'mill') {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.buildings.push({ id: 'b3', kind, x: 9, z: 5, rotation: 0 });
  s.nextId = 4;
  s.inventory = { ...emptyStock(), rice: 4, wheat: 4, flour: 2, wood: 1 };
  return s;
}
function accept(s, c, now = s.lastSeenAt) {
  const before = JSON.stringify(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), before);
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
for (const [kind, recipeId, inputs, output] of [
  ['mill', 'mill-rice', [{ item: 'rice', amount: 2 }], { item: 'milledRice', amount: 1 }],
  ['mill', 'mill-wheat', [{ item: 'wheat', amount: 2 }], { item: 'flour', amount: 1 }],
  [
    'bakery',
    'bake-bread',
    [
      { item: 'flour', amount: 2 },
      { item: 'wood', amount: 1 },
    ],
    { item: 'bread', amount: 2 },
  ],
])
  test(`${recipeId} uses explicit inputs, immutable timed output and receipt identity`, () => {
    const initial = town(kind);
    let s = accept(initial, { type: 'startProcessing', buildingId: 'b3', recipeId });
    const job = s.buildings[2].processingJob;
    assert.deepEqual(job.inputs, inputs);
    assert.deepEqual(job.outputs, [output]);
    for (const input of inputs)
      assert.equal(s.inventory[input.item], initial.inventory[input.item] - input.amount);
    const collect = { type: 'collectProcessing', buildingId: 'b3', jobId: job.id };
    reject(s, collect, job.readyAt - 1);
    reject(s, { type: 'startProcessing', buildingId: 'b3', recipeId });
    s = accept(s, collect, job.readyAt);
    assert.equal(
      s.inventory[output.item],
      initial.inventory[output.item] +
        output.amount -
        (inputs.find((i) => i.item === output.item)?.amount ?? 0),
    );
    assert.equal(s.fusion.discoveries[recipeId].count, 1);
    reject(s, collect);
  });
test('full storage, missing or wrong inputs, IDs and time bounds retain original state', () => {
  const s = town();
  reject(s, { type: 'startProcessing', buildingId: 'b3', recipeId: '__proto__' });
  reject(s, { type: 'startProcessing', buildingId: 'b3', recipeId: 'bake-bread' });
  const maxId = { ...s, nextId: MAX_VALUE };
  reject(maxId, { type: 'startProcessing', buildingId: 'b3', recipeId: 'mill-rice' });
  reject(s, { type: 'startProcessing', buildingId: 'b3', recipeId: 'mill-rice' }, MAX_TIME);
  let busy = accept(s, { type: 'startProcessing', buildingId: 'b3', recipeId: 'mill-rice' });
  busy.inventory.wood += g.getCapacity(busy) - g.getUsedStorage(busy);
  const job = busy.buildings[2].processingJob;
  reject(busy, { type: 'collectProcessing', buildingId: 'b3', jobId: job.id }, job.readyAt);
  busy.inventory.wood--;
  busy = accept(busy, { type: 'collectProcessing', buildingId: 'b3', jobId: job.id }, job.readyAt);
  assert.equal(busy.inventory.milledRice, 1);
});
test('offline jobs and nested snapshots survive moves, clock rollback and later balancing', () => {
  let s = accept(town(), { type: 'startProcessing', buildingId: 'b3', recipeId: 'mill-rice' });
  const oldJob = s.buildings[2].processingJob;
  const rotated = accept(s, { type: 'rotateBuilding', buildingId: 'b3' }, 0);
  assert.notEqual(rotated.buildings[2].processingJob.inputs[0], oldJob.inputs[0]);
  const config = g.PROCESSING_RECIPES['mill-rice'],
    oldDuration = config.durationMs,
    oldAmount = config.outputs[0].amount;
  try {
    config.durationMs = 20000;
    config.outputs[0].amount = 3;
    s = g.importSave(g.exportSave(rotated), oldJob.readyAt + 100000);
    s = accept(s, { type: 'collectProcessing', buildingId: 'b3', jobId: oldJob.id });
    assert.equal(s.inventory.milledRice, 1);
  } finally {
    config.durationMs = oldDuration;
    config.outputs[0].amount = oldAmount;
  }
});
