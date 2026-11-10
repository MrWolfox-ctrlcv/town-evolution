const test = require('node:test');
const assert = require('node:assert/strict');
const { CooperativePrebuild } = require('../.domain-build/application/CooperativePrebuild');
test('CPU prebuild progresses between slow render frames, stops at one transaction and never publishes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let steps = 0,
    commits = 0,
    snapshot = 'old';
  const pump = new CooperativePrebuild(() => ++steps === 4);
  pump.start();
  pump.start();
  for (let i = 0; i < 4; i++) t.mock.timers.tick(4);
  assert.equal(steps, 4);
  t.mock.timers.tick(160);
  assert.equal(steps, 4);
  assert.equal(commits, 0);
  assert.equal(snapshot, 'old');
  pump.stop();
});
test('cancel prevents stale work, restart is unique and errors cross the render boundary once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let steps = 0;
  const failure = new Error('budget');
  const pump = new CooperativePrebuild(() => {
    steps++;
    throw failure;
  });
  pump.start();
  pump.stop();
  t.mock.timers.tick(100);
  assert.equal(steps, 0);
  pump.start();
  pump.start();
  t.mock.timers.tick(4);
  assert.equal(steps, 1);
  pump.start();
  t.mock.timers.tick(100);
  assert.equal(steps, 1);
  assert.throws(() => pump.check(), failure);
  assert.doesNotThrow(() => pump.check());
  pump.stop();
});
