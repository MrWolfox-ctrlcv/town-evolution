const test = require('node:test');
const assert = require('node:assert/strict');
const { createV7WaterFields } = require('../.domain-build/domain/v7-coast-fields');
const { V7BaseHydrology } = require('../.domain-build/domain/v7-hydrology-base');
const { V7TerrainBuilder } = require('../.domain-build/domain/v7-terrain-builder');
const {
  V7_COAST_NOISE,
  V7_PERLIN_LIPSCHITZ,
  V7_FIELD_EPSILON,
} = require('../.domain-build/domain/v7-contracts');
const { perlin } = require('../.domain-build/domain/v5-noise');
const { hasPreparedV7World } = require('../.domain-build/domain/v7-world');

test('v7 fixed noise scales exceed analytic bounds; frozen Perlin is normalized', () => {
  assert.ok(V7_PERLIN_LIPSCHITZ > 1 + (15 * Math.SQRT2) / 4);
  for (const p of Object.values(V7_COAST_NOISE))
    assert.ok(
      p.scale >
        1 +
          V7_PERLIN_LIPSCHITZ *
            p.amplitudes.reduce((sum, a, i) => sum + Math.abs(a) / p.wavelengths[i], 0),
    );
  for (const seed of [1, 7, 42173, 1e9])
    for (let i = -32; i <= 32; i++) {
      assert.ok(Math.abs(perlin(i / 7, i / 11, seed) / Math.SQRT2) <= 1);
    }
});
test('v7 whole outer shore and both bays change with seed, not only freshwater', () => {
  const a = createV7WaterFields(1),
    b = createV7WaterFields(42173);
  for (const [x0, z0, x1, z1] of [
    [15, 25, 70, 90],
    [140, 60, 185, 110],
    [50, 145, 110, 185],
  ]) {
    let changes = 0;
    for (let z = z0; z < z1; z += 0.5)
      for (let x = x0; x < x1; x += 0.5) {
        const q = a.fields(x, z),
          r = b.fields(x, z);
        if (q.dry >= 0 !== r.dry >= 0) changes++;
      }
    assert.ok(changes > 0);
  }
  assert.deepEqual(a.fields(31.125, 70.5), createV7WaterFields(1).fields(31.125, 70.5));
  assert.deepEqual(a.metadata.bays, [
    [172, 94, 24, 18],
    [83, 173, 21, 23],
  ]);
  for (const bad of [0, 1e9 + 1, NaN, 1.5]) assert.throws(() => createV7WaterFields(bad));
  assert.throws(() => a.fields(Infinity, 0));
});
test('v7 mathematical outer edge bound and guarded cell certificates cover dense critical points', () => {
  for (const seed of [1, 7, 42173, 1e9]) {
    const b = new V7BaseHydrology(seed),
      critical = [];
    for (let z = 0; z < 192; z++)
      for (let x = 0; x < 192; x++) {
        const c = b.classifyCell(x, z);
        if (c.state === 'dryBuildable' || c.state === 'clearWater')
          critical.push({
            c,
            gap:
              c.state === 'dryBuildable'
                ? c.dryLower - 0.15
                : -c.dryUpper - c.certificate.requiredDepth,
          });
      }
    critical.sort((a, b) => a.gap - b.gap);
    for (const { c } of critical.slice(0, 32))
      for (let j = 0; j <= 8; j++)
        for (let i = 0; i <= 8; i++) {
          const f = b.fields(c.x + i / 8, c.z + j / 8);
          assert.ok(f.dry >= c.dryLower && f.dry <= c.dryUpper);
          assert.ok(f.freshwater >= c.freshLower && f.ocean >= c.oceanLower);
          if (c.state === 'clearWater')
            assert.ok(
              Math.fround(b.sample(c.x + i / 8, c.z + j / 8).height) < -0.642 - V7_FIELD_EPSILON,
            );
        }
    for (let n = 0; n <= 768; n++)
      for (const [x, z] of [
        [0, n / 4],
        [192, n / 4],
        [n / 4, 0],
        [n / 4, 192],
      ])
        assert.ok(b.sample(x, z).height <= -0.6875 + 1e-10);
  }
});
test('v7 full finite core worlds qualify through bounded cancellable work', () => {
  for (const seed of [1, 7, 42173]) {
    const b = new V7TerrainBuilder(seed);
    const stages = new Set();
    while (b.progress.status === 'building') {
      const p = b.step(64);
      assert.ok(p.stepWork <= 64);
      stages.add(p.stage);
    }
    const result = b.takeResult(),
      q = result.qualification;
    assert.equal(result.terrain.revision, 'v7-seeded-coast-1');
    assert.ok(q.landCells >= 20 * q.legacyV3LandCells);
    assert.equal(q.connectedLandCells, q.landCells);
    assert.ok(Object.values(q.biomes).every((n) => n > 0));
    for (const stage of [
      'qualification-cells',
      'qualification-connectivity',
      'qualification-border',
      'qualification-water',
    ])
      assert.ok(stages.has(stage), stage);
    assert.ok(q.borderBedUpper < -0.642);
    assert.throws(() => b.takeResult());
    assert.equal(hasPreparedV7World(seed), false, 'builder result is not auto-published');
  }
  const cancelled = new V7TerrainBuilder(999);
  cancelled.step(10);
  assert.equal(cancelled.cancel(), true);
  assert.equal(cancelled.progress.status, 'cancelled');
  assert.equal(cancelled.step(64).stepWork, 0);
  assert.throws(() => cancelled.takeResult());
});

test('qualification frozen terrain3 predicate matches actual legacy land on all cells', () => {
  const { v7LegacyV3LandCell } = require('../.domain-build/domain/v7-legacy-land');
  const { isLandCell } = require('../.domain-build/domain/island');
  for (const seed of [1, 7, 42173, 1e9])
    for (let z = -1; z <= 40; z++)
      for (let x = -1; x <= 40; x++)
        assert.equal(v7LegacyV3LandCell(x, z, seed), isLandCell(x, z, seed, 3));
});
