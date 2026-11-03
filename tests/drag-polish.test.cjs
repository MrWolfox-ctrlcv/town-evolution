const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sampleStroke } = require('../.domain-build/application/StrokeSampling.js');
const { DeferredLayout } = require('../.domain-build/application/DeferredLayout.js');
const { FarmSweep } = require('../.domain-build/application/FarmSweep.js');
const { createGame, dispatch } = require('../.domain-build/domain/game.js');
test('fast sparse stroke samples intervening farms once, including reverse sweep', () => {
  let state = dispatch(createGame(0), { type: 'place', kind: 'farm', x: 8, z: 6 }, 0).state;
  const ids = ['b2', state.buildings.at(-1).id];
  state.inventory.vegetable = 2;
  for (const id of ids)
    state = dispatch(state, { type: 'plantCell', buildingId: id, cell: 0 }, 0).state;
  const sweep = new FarmSweep();
  sweep.begin('harvest');
  let started = 0;
  for (const [from, to] of [
    [
      { x: 0, y: 10 },
      { x: 150, y: 10 },
    ],
    [
      { x: 150, y: 10 },
      { x: 0, y: 10 },
    ],
  ]) {
    for (const p of sampleStroke(from, to)) {
      const id = p.x >= 35 && p.x <= 60 ? ids[0] : p.x >= 90 && p.x <= 115 ? ids[1] : null;
      const command = sweep.command(state, id, 0);
      if (command) {
        const result = dispatch(state, command, 15000);
        assert.ok(result.ok);
        state = result.state;
        started++;
      }
    }
  }
  assert.equal(started, 2);
  assert.equal(state.inventory.vegetable, 4);
});
test('sampling includes release endpoint, guards invalid input and caps huge jumps', () => {
  assert.deepEqual(sampleStroke(null, { x: 5, y: 6 }), [{ x: 5, y: 6 }]);
  assert.deepEqual(sampleStroke({ x: 0, y: 0 }, { x: 30, y: 20 }).at(-1), { x: 30, y: 20 });
  assert.deepEqual(sampleStroke(null, { x: NaN, y: 0 }), []);
  assert.deepEqual(sampleStroke(null, { x: 0, y: 0 }, 0), []);
  assert.equal(sampleStroke({ x: 0, y: 0 }, { x: 1e8, y: 1e8 }).length, 256);
});
test('HUD geometry changes wait through move and release sampling, then flush once', () => {
  const layout = new DeferredLayout();
  assert.equal(layout.update(true, true), false);
  assert.equal(layout.update(false, true), false);
  assert.equal(layout.update(true, true), false);
  assert.equal(layout.update(false, false), true);
  assert.equal(layout.update(false, false), false);
});
test('resize can clear queued geometry after explicitly cancelling a tool', () => {
  const layout = new DeferredLayout();
  layout.update(true, true);
  layout.clear();
  assert.equal(layout.update(false, false), false);
  assert.equal(layout.update(true, false), true);
});
