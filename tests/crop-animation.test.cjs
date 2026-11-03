const test = require('node:test');
const assert = require('node:assert/strict');
const { cropPose, cropPhase } = require('../.domain-build/art/CropAnimation');
const { cropCell } = require('../.domain-build/art/FarmCellKit');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const job = { id: 'test', crop: 'wheat', startedAt: 1000, readyAt: 16000 };
test('crop motion is deterministic, independent and leaves gameplay jobs untouched', () => {
  const original = JSON.stringify(job);
  assert.deepEqual(cropPose(job, 6000, 2, false), cropPose(job, 6000, 2, false));
  assert.notDeepEqual(cropPose(job, 6100, 2, false), cropPose(job, 6000, 2, false));
  assert.equal(new Set(Array.from({ length: 9 }, (_, cell) => cropPhase(3, 7, cell))).size, 9);
  assert.equal(JSON.stringify(job), original);
});
test('growth remains bounded, ripening stretch expires and never replays for old mature plants', () => {
  assert.equal(cropPose(job, 1000, 0, false).height, 0.78);
  assert.equal(cropPose(job, 16000, 0, false).height, 1);
  assert.ok(cropPose(job, 16400, 0, true).height > 1);
  for (const time of [16800, 30000, 1e12]) assert.equal(cropPose(job, time, 0, true).height, 1);
});
test('all animated crop vertices stay in their own soil cells throughout wind and ripening', () => {
  for (const crop of ['vegetable', 'wheat', 'lettuce'])
    for (const ready of [false, true]) {
      const mesh = compileAsset(cropCell(ready ? 'ready' : 'seedling', crop));
      for (let now = 1000; now < 35000; now += 157)
        for (const phase of [0, 1, 3, 5]) {
          const p = cropPose({ ...job, crop }, now, phase, ready);
          const rx = (p.leanX * Math.PI) / 180,
            rz = (p.leanZ * Math.PI) / 180;
          for (let i = 0; i < mesh.positions.length; i += 3) {
            const x = mesh.positions[i] * p.width,
              y = (mesh.positions[i + 1] - 0.17) * p.height,
              z = mesh.positions[i + 2] * p.width;
            const yy = y * Math.cos(rx) - z * Math.sin(rx),
              zz = y * Math.sin(rx) + z * Math.cos(rx);
            const xx = x * Math.cos(rz) - yy * Math.sin(rz);
            assert.ok(Math.abs(xx) < 1 / 3 && Math.abs(zz) < 1 / 3, `${crop} remains in own cell`);
          }
        }
    }
});

const { cropClock } = require('../.domain-build/art/CropAnimation');
test('resume skips expired ripening pulse and rollback cannot reverse animation time', () => {
  const resumed = cropClock(16200, 0.016, 100000);
  assert.equal(cropPose(job, resumed, 0, true).height, 1);
  assert.equal(cropClock(100000, 0.016, 90000), 100016);
});
