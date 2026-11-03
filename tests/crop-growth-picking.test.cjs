const test = require('node:test');
const assert = require('node:assert/strict');
const { growthStage } = require('../.domain-build/art/CropGrowth');
const { pickFarmCrop } = require('../.domain-build/application/FarmPicking');
const { farmCellCenter, farmCellAt } = require('../.domain-build/application/FarmCells');
const job = { id: 'j1', crop: 'wheat', startedAt: 1000, readyAt: 16000 };
test('growth boundaries use saved timestamps, including offline maturity and legacy jobs', () => {
  assert.equal(growthStage(null, 5000), 'empty');
  for (const [now, stage] of [
    [999, 'seedling'],
    [6249, 'seedling'],
    [6250, 'young'],
    [15999, 'young'],
    [16000, 'ready'],
    [1e9, 'ready'],
  ])
    assert.equal(growthStage(job, now), stage);
  assert.equal(growthStage({ ...job, readyAt: 31000 }, 11499), 'seedling');
  assert.equal(growthStage({ ...job, readyAt: 31000 }, 11500), 'young');
  assert.deepEqual(job, { id: 'j1', crop: 'wheat', startedAt: 1000, readyAt: 16000 });
});
test('aiming at edge crop heads hits their own cell for all farm rotations', () => {
  for (const rotation of [0, 1, 2, 3])
    for (let cell = 0; cell < 9; cell++) {
      const farm = { id: 'f', kind: 'farm', x: 4, z: 6, rotation, cropJobs: Array(9).fill(null) };
      farm.cropJobs[cell] = job;
      const c = farmCellCenter(farm, cell),
        d = { x: -0.49, y: -0.65, z: -0.58 };
      const ray = { o: { x: c.x - d.x * 10, y: 0.55 - d.y * 10, z: c.z - d.z * 10 }, d };
      const hit = pickFarmCrop([farm], ray, 16000);
      assert.equal(hit?.cell, cell);
      const t = (0.17 - ray.o.y) / ray.d.y;
      const soil = farmCellAt(farm, { x: ray.o.x + ray.d.x * t, z: ray.o.z + ray.d.z * t });
      if (cell === 0 && rotation === 0)
        assert.notEqual(soil, cell, 'old soil-only targeting misses visible edge crop');
      farm.cropJobs[cell] = null;
      assert.equal(
        pickFarmCrop([farm], ray, 16000),
        null,
        'harvested cells stop intercepting the next stroke',
      );
    }
});
