/** Independent analytic terrain material checks. Synthetic flat/ramp samples are CPU unit inputs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  naturalLayerQuanta,
  fillLayerQuanta,
  retainedLayerQuanta,
  v6EditPlane,
} = require('../.domain-build/domain/v6-material-volume');
const {
  validItemAmount,
  formatV6MaterialAmount,
} = require('../.domain-build/domain/v6-material-amount');
function world(ground, extra = () => 0, kind = null) {
  return {
    size: 192,
    vertex: (x, z) => ({
      ground: Math.fround(ground(x / 4, z / 4)),
      soil: kind === 'soil' ? Math.fround(extra(x / 4, z / 4)) : 0,
      stone: kind === 'stone' ? Math.fround(extra(x / 4, z / 4)) : 0,
    }),
    resourceAt: (x, z) => (kind ? { id: `n${x}_${z}`, x, z, kind, amount: 2 } : null),
    occupiedLevels: () => [1, 2],
  };
}
const checkpoint = (amount = 0) => ({
  x: 0,
  z: 0,
  initialResourceAmount: amount,
  cutLevel: null,
  level: 0,
  fills: [],
});

test('terrain6 nominal full layer and half-cell ramp match independent analytic volume', () => {
  const full = world(() => v6EditPlane(1));
  assert.deepEqual(naturalLayerQuanta(full, checkpoint(), 1), { soil: 4096, stone: 0 });
  assert.equal(fillLayerQuanta(full, checkpoint(), 1), 0);
  const ramp = world((x) => v6EditPlane(0) + x);
  assert.deepEqual(naturalLayerQuanta(ramp, checkpoint(), 1), { soil: 2048, stone: 0 });
  assert.equal(fillLayerQuanta(ramp, checkpoint(), 1), 2048);
});

test('terrain6 mixed half-soil half-stone layer has one shared volume budget', () => {
  const mixed = world(
    () => v6EditPlane(0) + 0.5,
    () => 0.5,
    'stone',
  );
  assert.deepEqual(naturalLayerQuanta(mixed, checkpoint(2), 1), { soil: 2048, stone: 2048 });
  assert.equal(fillLayerQuanta(mixed, checkpoint(2), 1), 0);
  const exhausted = checkpoint(0);
  assert.deepEqual(naturalLayerQuanta(mixed, exhausted, 1), { soil: 2048, stone: 0 });
  assert.equal(fillLayerQuanta(mixed, exhausted, 1), 2048);
  const cut = { ...checkpoint(2), cutLevel: 0 };
  assert.deepEqual(retainedLayerQuanta(mixed, cut, 1), { soil: 0, stone: 0 });
  assert.equal(fillLayerQuanta(mixed, cut, 1), 4096);
});

test('terrain6 tiny positive geometry cannot round to a free full fill or disappear', () => {
  const sliver = world(() => v6EditPlane(0) + 1e-7);
  const q = naturalLayerQuanta(sliver, checkpoint(), 1);
  assert.equal(q.soil, 1);
  assert.equal(q.stone, 0);
  assert.equal(fillLayerQuanta(sliver, checkpoint(), 1), 4095);
});

test('terrain6 accepts only binary quanta for soil and stone and displays every remainder', () => {
  for (const item of ['soil', 'stone'])
    for (const amount of [0, 1 / 4096, 2047 / 4096, 1.5, 64]) {
      assert.equal(validItemAmount(amount, item, 6), true);
      assert.equal(Number(formatV6MaterialAmount(amount)), amount);
      if (amount > 0) assert.notEqual(formatV6MaterialAmount(amount), '0');
    }
  for (const amount of [-1, NaN, Infinity, 1 / 8192, 0.1, Number.MAX_SAFE_INTEGER])
    for (const item of ['soil', 'stone']) assert.equal(validItemAmount(amount, item, 6), false);
  for (const item of ['wood', 'mud', 'treeSeed', 'roastedCarrot'])
    assert.equal(validItemAmount(1 / 4096, item, 6), false);
  for (const version of [1, 2, 3, 4, 5])
    for (const item of ['soil', 'stone'])
      assert.equal(validItemAmount(1 / 4096, item, version), false);
});
