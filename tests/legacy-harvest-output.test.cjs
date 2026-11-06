const { hammerAssemblyCommand } = require('./helpers/hammer-assembly.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { looseAmount, pickupDrops } = require('./helpers/loose-output.cjs');

function run(state, command, now = state.lastSeenAt) {
  const before = g.exportSave(state);
  const result = g.dispatch(state, command, now);
  assert.equal(result.ok, true, result.error);
  assert.equal(g.exportSave(state), before);
  assert.deepEqual(g.importSave(g.exportSave(result.state), result.state.lastSeenAt), result.state);
  return result.state;
}
function total(state, crop) {
  return (
    state.inventory[crop] +
    looseAmount(state, crop) +
    state.groundStacks.reduce((sum, pile) => sum + (pile.item === crop ? pile.amount : 0), 0) +
    state.buildings.reduce((sum, building) => sum + (building.collectionBox?.stock[crop] ?? 0), 0)
  );
}
function box(state) {
  state = { ...state, inventory: { ...state.inventory, wood: 2 } };
  state = run(state, { type: 'dropProduct', item: 'wood', quantity: 2, x: 9, z: 5 });
  state = run(state, { type: 'useTool', tool: 'hammer', x: 9, z: 5 });
  const crateId = state.buildings.at(-1).id;
  const before = g.exportSave(state);
  const stale = g.dispatch(
    state,
    { type: 'attachFarmBox', buildingId: 'b2', crateId },
    state.lastSeenAt,
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.state, state);
  assert.equal(g.exportSave(state), before);
  return run(state, hammerAssemblyCommand(state, ['b2', crateId]));
}
function town(crop) {
  const state = g.createGame(1000, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.inventory = { ...emptyStock(), [crop]: 1 };
  if (crop === 'rice') state.buildings.find((b) => b.id === 'b2').irrigated = true;
  return run(state, { type: 'plantCell', buildingId: 'b2', cell: 4, crop });
}

for (const crop of ['vegetable', 'wheat', 'lettuce'])
  for (const boxed of [false, true])
    test(`schema8 ${crop} promise keeps its original timer and yield through ${boxed ? 'manual farm-box collection' : 'ground drop and explicit pickup'}`, () => {
      let state = town(crop);
      const originalJob = structuredClone(state.buildings.find((b) => b.id === 'b2').cropJobs[4]);
      delete originalJob.durationMs;
      delete originalJob.yield;
      const raw = JSON.parse(g.exportSave(state));
      raw.schemaVersion = 8;
      delete raw.looseDrops;
      delete raw.buildings.find((b) => b.id === 'b2').cropJobs[4].durationMs;
      delete raw.buildings.find((b) => b.id === 'b2').cropJobs[4].yield;
      for (const item of ['rice', 'sapling', 'milledRice', 'flour', 'bread'])
        delete raw.inventory[item];
      const originalBytes = JSON.stringify(raw);
      const previousConfig = { ...g.CROPS[crop] };
      try {
        Object.assign(g.CROPS[crop], { durationMs: 30000, yield: 5 });
        state = g.importSave(originalBytes, 1000);
        assert.equal(JSON.stringify(raw), originalBytes);
        assert.deepEqual(state.buildings.find((b) => b.id === 'b2').cropJobs[4], originalJob);
        if (boxed) state = box(state);
        const command = { type: 'harvestCell', buildingId: 'b2', cell: 4 };
        const early = g.dispatch(state, command, originalJob.readyAt - 1);
        assert.equal(early.ok, false);
        assert.equal(early.state, state);
        state = g.importSave(g.exportSave(state), originalJob.readyAt + 100000);
        assert.equal(
          total(state, crop),
          0,
          'Maturity and offline loading do not collect automatically',
        );
        assert.deepEqual(state.buildings.find((b) => b.id === 'b2').cropJobs[4], originalJob);
        const inventory = { ...state.inventory };
        state = run(state, command);
        assert.deepEqual(state.inventory, inventory, 'Manual harvesting never changes town stock');
        assert.equal(total(state, crop), 2, 'Original promise remains two despite new balance');
        const farm = state.buildings.find((b) => b.id === 'b2');
        assert.equal(farm.cropJobs[4], null);
        if (boxed) {
          assert.equal(farm.collectionBox.stock[crop], 2);
          assert.equal(state.looseDrops.length, 0);
          state = run(state, {
            type: 'withdrawFarmBox',
            buildingId: farm.id,
            item: crop,
            quantity: 2,
          });
        } else {
          assert.equal(looseAmount(state, crop), 2);
          assert.deepEqual(state.looseDrops[0].source, {
            type: 'crop',
            buildingId: 'b2',
            cell: 4,
            jobId: originalJob.id,
          });
          state = pickupDrops(state);
        }
        assert.equal(total(state, crop), 2);
        assert.equal(state.inventory[crop], 2);
        const duplicate = g.dispatch(state, command, state.lastSeenAt);
        assert.equal(duplicate.ok, false);
        assert.equal(duplicate.state, state);
        assert.deepEqual(g.importSave(g.exportSave(state), state.lastSeenAt), state);
      } finally {
        Object.assign(g.CROPS[crop], previousConfig);
      }
    });

for (const crop of g.CROP_KEYS)
  test(`${crop} a promised output above a pile limit splits exactly and remains conserved through partial pickups`, () => {
    const previous = { ...g.CROPS[crop] };
    try {
      g.CROPS[crop].yield = 13;
      let state = town(crop);
      const job = state.buildings.find((b) => b.id === 'b2').cropJobs[4];
      g.CROPS[crop].yield = 1;
      state = run(state, { type: 'harvestCell', buildingId: 'b2', cell: 4 }, job.readyAt);
      assert.equal(state.inventory[crop], 0);
      assert.deepEqual(
        state.looseDrops.map((drop) => drop.amount),
        [10, 3],
      );
      assert.equal(total(state, crop), 13);
      for (const drop of [...state.looseDrops]) {
        state = run(state, { type: 'pickupDrop', dropId: drop.id });
        assert.equal(total(state, crop), 13);
        const duplicate = g.dispatch(
          state,
          { type: 'pickupDrop', dropId: drop.id },
          state.lastSeenAt,
        );
        assert.equal(duplicate.ok, false);
        assert.equal(duplicate.state, state);
      }
      assert.equal(state.inventory[crop], 13);
      assert.equal(state.looseDrops.length, 0);
    } finally {
      Object.assign(g.CROPS[crop], previous);
    }
  });
