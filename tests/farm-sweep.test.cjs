const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FarmSweep } = require('../.domain-build/application/FarmSweep.js');
const { createGame, dispatch, exportSave } = require('../.domain-build/domain/game.js');
test('plant sweep consumes one per distinct cell and never repeats within gesture', () => {
  let state = createGame(0);
  state.inventory.vegetable = 9;
  const sweep = new FarmSweep();
  sweep.begin('plant');
  for (let cell = 0; cell < 9; cell++) {
    const command = sweep.command(state, 'b2', cell);
    assert.equal(command.type, 'plantCell');
    const result = dispatch(state, command, 0);
    assert.ok(result.ok);
    state = result.state;
    assert.equal(sweep.command(state, 'b2', cell), null);
  }
  assert.equal(state.inventory.vegetable, 0);
  assert.equal(state.buildings.find((b) => b.id === 'b2').cropJobs.filter(Boolean).length, 9);
  sweep.cancel();
  assert.equal(sweep.command(state, 'b2', 0), null);
});
test('harvest targets only swept mature cells and yields two each', () => {
  let state = createGame(0);
  state.inventory.vegetable = 3;
  for (const cell of [0, 1, 8])
    state = dispatch(state, { type: 'plantCell', buildingId: 'b2', cell }, 0).state;
  const sweep = new FarmSweep();
  sweep.begin('harvest');
  for (const cell of [0, 8]) state = dispatch(state, sweep.command(state, 'b2', cell), 15000).state;
  assert.equal(state.inventory.vegetable, 4);
  assert.ok(state.buildings.find((b) => b.id === 'b2').cropJobs[1]);
  assert.equal(sweep.command(state, 'b2', 0), null);
  assert.equal(sweep.command(state, 'b1', 0), null);
  assert.equal(sweep.command(state, 'b2', 9), null);
});
test('full storage, invalid and immature cells are atomic and retried only next gesture', () => {
  let state = createGame(0);
  state = dispatch(state, { type: 'plantCell', buildingId: 'b2', cell: 4 }, 0).state;
  const sweep = new FarmSweep();
  sweep.begin('harvest');
  const before = exportSave(state);
  assert.equal(dispatch(state, sweep.command(state, 'b2', 4), 1).ok, false);
  assert.equal(exportSave(state), before);
  assert.equal(sweep.command(state, 'b2', 4), null);
  sweep.begin('harvest');
  state.inventory.vegetable = 16;
  assert.equal(dispatch(state, sweep.command(state, 'b2', 4), 15000).ok, false);
  assert.ok(state.buildings.find((b) => b.id === 'b2').cropJobs[4]);
  state.inventory.vegetable = 0;
  sweep.begin('harvest');
  state = dispatch(state, sweep.command(state, 'b2', 4), 15000).state;
  assert.equal(state.inventory.vegetable, 2);
});

test('crop selection stays fixed through each sweep and harvest restores matching crop', () => {
  let state = createGame(0);
  state.inventory.wheat = 2;
  state.inventory.lettuce = 1;
  const sweep = new FarmSweep();
  sweep.begin('plant', 'wheat');
  for (const cell of [0, 1]) {
    const command = sweep.command(state, 'b2', cell);
    assert.equal(command.crop, 'wheat');
    state = dispatch(state, command, 0).state;
  }
  sweep.begin('plant', 'lettuce');
  state = dispatch(state, sweep.command(state, 'b2', 8), 0).state;
  assert.equal(state.inventory.vegetable, 1);
  assert.equal(state.inventory.wheat, 0);
  assert.equal(state.inventory.lettuce, 0);
  sweep.begin('harvest');
  for (const cell of [0, 1, 8])
    state = dispatch(state, sweep.command(state, 'b2', cell), 15000).state;
  assert.equal(state.inventory.wheat, 4);
  assert.equal(state.inventory.lettuce, 2);
});
