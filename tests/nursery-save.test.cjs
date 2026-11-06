const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTreeGrowth, parseNurseryJob } = require('../.domain-build/domain/nursery-save.js');
const { MAX_TIME } = require('../.domain-build/domain/config.js');
const { MAX_CROP_DURATION, MAX_CROP_YIELD } = require('../.domain-build/domain/crops.js');

test('growth import accepts only complete bounded snapshots or a genuinely absent legacy snapshot', () => {
  assert.deepEqual(parseTreeGrowth({ id: 't1', x: 1, z: 2 }, 1000), {});
  const valid = { plantedAt: 1000, readyAt: 31_000, growthDurationMs: 30_000 };
  assert.deepEqual(parseTreeGrowth(valid, 1000), valid);
  assert.deepEqual(parseTreeGrowth(valid, 80_000), valid);
  for (const key of ['plantedAt', 'readyAt', 'growthDurationMs']) {
    for (const value of [undefined, null, '1000', -1, 0.5, NaN, Infinity])
      assert.throws(() => parseTreeGrowth({ ...valid, [key]: value }, 1000));
  }
  for (const value of [
    { ...valid, plantedAt: 1001 },
    { ...valid, readyAt: 1000, growthDurationMs: 0 },
    { ...valid, readyAt: 30_000 },
    { plantedAt: 0, readyAt: MAX_CROP_DURATION + 1, growthDurationMs: MAX_CROP_DURATION + 1 },
    { plantedAt: MAX_TIME, readyAt: MAX_TIME + 1, growthDurationMs: 1 },
  ])
    assert.throws(() => parseTreeGrowth(value, MAX_TIME));
});

test('nursery jobs retain a promised duration and yield and validate IDs through the shared registry', () => {
  const job = { id: 'j7', startedAt: 1000, readyAt: 16_000, durationMs: 15_000, yield: 1 };
  const seen = [];
  assert.deepEqual(
    parseNurseryJob(job, 2000, (id, prefix) => {
      seen.push([id, prefix]);
      return id;
    }),
    job,
  );
  assert.deepEqual(seen, [['j7', 'j']]);
  assert.throws(() =>
    parseNurseryJob(job, 2000, () => {
      throw new Error('duplicate ID');
    }),
  );
  const balanced = { ...job, readyAt: 46_000, durationMs: 45_000, yield: 3 };
  assert.deepEqual(
    parseNurseryJob(balanced, 2000, (id) => id),
    balanced,
  );
});

test('nursery job parsing rejects missing, malformed, future, crop and out-of-bounds snapshots', () => {
  const job = { id: 'j7', startedAt: 1000, readyAt: 16_000, durationMs: 15_000, yield: 1 };
  for (const value of [
    null,
    [],
    {},
    { ...job, startedAt: 2001, readyAt: 17_001 },
    { ...job, readyAt: 15_999 },
    { ...job, crop: 'vegetable' },
    { ...job, durationMs: 0 },
    { ...job, durationMs: MAX_CROP_DURATION + 1 },
    { ...job, readyAt: MAX_TIME + 1 },
    { ...job, yield: 0 },
    { ...job, yield: MAX_CROP_YIELD + 1 },
    { ...job, yield: 0.5 },
    { ...job, yield: '1' },
  ])
    assert.throws(() => parseNurseryJob(value, 2000, (id) => id));
  for (const key of ['startedAt', 'readyAt', 'durationMs', 'yield']) {
    const missing = { ...job };
    delete missing[key];
    assert.throws(() => parseNurseryJob(missing, 2000, (id) => id));
  }
});
