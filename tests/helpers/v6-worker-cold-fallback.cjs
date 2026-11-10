/** Executed in a fresh process so another test cannot warm the preparation cache. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  configureV6WorkerFactory,
  createV6Preparation,
  V6WorkerPreparation,
} = require('../../.domain-build/application/V6WorkerPreparation');
const { isPreparedV6World } = require('../../.domain-build/domain/v6-terrain-builder');
const worlds = require('../../.domain-build/domain/v6-world');
const game = require('../../.domain-build/domain/game');
const expected = require('../fixtures/terrain6-worker-baseline.json');
const seed = expected.seed;
const coldBefore = worlds.hasPreparedV6World(seed) === false;
assert.equal(coldBefore, true, 'The child process must start without a prepared world');
let starts = 0;
configureV6WorkerFactory(() => {
  starts++;
  throw Error('Simulated Worker startup failure with no cached world');
});
try {
  const job = createV6Preparation(seed);
  assert.ok(job instanceof V6WorkerPreparation, 'Exercise the real factory-selected worker route');
  assert.equal(starts, 1);
  assert.equal(worlds.hasPreparedV6World(seed), false);
  assert.throws(() => job.takeResult(), /No complete/);
  let ticks = 0;
  let progress;
  do {
    progress = job.step(256);
    ticks++;
    assert.equal(job.mode, 'fallback');
    assert.equal(worlds.hasPreparedV6World(seed), false, 'No partial world may be published');
    assert.ok(progress.stepWork > 0 && progress.stepWork <= 256);
    assert.ok(ticks <= 10000, 'Cold fallback must terminate within a bounded number of steps');
  } while (progress.status === 'building');
  assert.equal(progress.status, 'ready');
  assert.ok(ticks > 1, 'Cold fallback must perform real cooperative generation');
  assert.ok(progress.completedWork > 100000, 'The result must not be a cache hit');
  const result = job.takeResult();
  assert.equal(isPreparedV6World(result), true);
  assert.equal(worlds.getV6World(seed), result.terrain);
  assert.equal(starts, 1, 'Startup failure must not keep retrying Worker construction');
  assert.equal(job.step(256).status, 'consumed');
  assert.throws(() => job.takeResult(), /No complete/);
  const bytes = game.exportSave(game.createGame(60000, seed, 6));
  const saveHash = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(saveHash, expected.saveHash, 'Cold fallback must retain the pre-change save bytes');
  assert.equal(game.exportSave(game.importSave(bytes, 60000)), bytes);
  process.stdout.write(JSON.stringify({ coldBefore, starts, ticks, saveHash }) + '\n');
} finally {
  configureV6WorkerFactory(null);
}
