const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContinuousCoast } = require('../.domain-build/art/ContinuousCoast');
const {
  buildCoastalWater,
  coastalFoamStrength,
  coastalWaveHeight,
} = require('../.domain-build/art/CoastalWater');
const land = (x, z) => x >= 4 && x < 24 && z >= 4 && z < 24;
const near = (a, b) => Math.abs(a - b) < 1e-8;

test('natural shoreline has a visible dry beach, wet sand and submerged shelf', () => {
  const coast = buildContinuousCoast(30, 711, land);
  assert.equal(coast.coastFallback, false);
  assert.equal(coast.waterlines.length, coast.outlines.length);
  const widths = coast.waterlines[0].map((p, i) =>
    Math.hypot(p[0] - coast.outlines[0][i][0], p[1] - coast.outlines[0][i][1]),
  );
  assert.ok(
    widths.filter((width) => width > 1.7).length > widths.length * 0.8,
    'visible shore is a wide slope, not a narrow wall stripe',
  );
  const dry = [],
    wet = [],
    submerged = [];
  for (let i = 0; i < coast.mesh.positions.length; i += 3) {
    const y = coast.mesh.positions[i + 1],
      index = i / 3;
    if (near(y, -0.205)) dry.push(index);
    if (near(y, -0.575)) wet.push(index);
    if (y < -0.7) submerged.push(index);
  }
  assert.ok(dry.length > 100 && wet.length > 100 && submerged.length > 100);
  assert.ok(
    dry.every((i) => coast.mesh.colors[i * 4] > 0.85),
    'sand albedo has no baked directional lighting',
  );
  assert.ok(wet.every((i) => coast.mesh.colors[i * 4] < 0.77));
  assert.ok(
    dry.every((i) => coast.mesh.normals[i * 3 + 1] > 0.7),
    'dry sand is an upward-facing slope',
  );
});

test('protected dock approaches keep exact water contact while nearby beaches remain broad', () => {
  const coast = buildContinuousCoast(30, 711, land, [{ x: 3, z: 9, width: 2, depth: 2 }]);
  const index = coast.outlines[0].findIndex(([x, z]) => x === 4 && z === 10);
  assert.ok(index >= 0);
  assert.deepEqual(coast.waterlines[0][index], [4, 10], 'sand must not fill the dock exit');
  const other = coast.outlines[0].findIndex(([x, z]) => near(x, 4) && near(z, 20));
  assert.ok(other >= 0);
  assert.ok(coast.waterlines[0][other][0] < 2.4);
});

test('lake holes and corner-touch reclamation use exact banks without sand bridges', () => {
  const coast = buildContinuousCoast(
    30,
    711,
    (x, z) => land(x, z) && !(x >= 10 && x < 13 && z >= 10 && z < 13),
  );
  assert.equal(coast.coastFallback, true);
  const hole = coast.outlines.findIndex((loop) =>
    loop.every(([x, z]) => x >= 10 && x <= 13 && z >= 10 && z <= 13),
  );
  assert.ok(hole >= 0);
  assert.deepEqual(coast.waterlines[hole], coast.outlines[hole], 'lake banks remain exact');
  assert.ok(
    coast.waterlines.some((line, i) => JSON.stringify(line) !== JSON.stringify(coast.outlines[i])),
    'creating a lake does not remove the outer beach',
  );
  assert.ok(
    coast.mesh.positions.length / 3 < 2000,
    'exact tops merge into row strips instead of one quad per tile',
  );
});

test('192-grid ocean has detailed shallow strips and cannot overflow dynamic Uint16 indices', () => {
  const coast = buildContinuousCoast(192, 711, (x, z) => Math.hypot((x - 96) / 1.08, z - 96) < 80);
  const before = JSON.stringify(coast.outlines),
    water = buildCoastalWater(192, 711, coast.waterlines);
  const count = water.positions.length / 3;
  assert.ok(count < 65536 && count > 20000);
  assert.equal(water.shoreDistances.length, count);
  assert.equal(water.heightOffsets.length, count);
  assert.equal(water.shoreBreaks.length, count);
  assert.deepEqual(Array.from(new Uint16Array(water.indices)), water.indices);
  assert.ok(water.shoreDistances.some((d) => d === 0.3));
  assert.ok(water.shoreDistances.some((d) => d === 6));
  assert.ok(water.colors.every(Number.isFinite));
  assert.equal(JSON.stringify(coast.outlines), before);
  const step = 4.5,
    origin = -192;
  for (const time of [0, 1.3, 4.7, 9])
    for (let i = 0; i < count; i += 71) {
      if (water.shoreDistances[i] < 0) continue;
      const x = water.positions[i * 3],
        z = water.positions[i * 3 + 2],
        x0 = origin + Math.floor((x - origin) / step) * step,
        z0 = origin + Math.floor((z - origin) / step) * step,
        u = (x - x0) / step,
        v = (z - z0) / step,
        h = (xx, zz) => coastalWaveHeight(xx, zz, 711, time),
        base =
          v >= u
            ? h(x0, z0) * (1 - v) + h(x0, z0 + step) * (v - u) + h(x0 + step, z0 + step) * u
            : h(x0, z0) * (1 - u) + h(x0 + step, z0 + step) * v + h(x0 + step, z0) * (u - v);
      assert.ok(
        h(x, z) + water.heightOffsets[i] > base,
        'fine waves never cross the coarse ocean triangles',
      );
    }

  assert.deepEqual(
    buildCoastalWater(192, 711, coast.waterlines),
    water,
    'geometry and breakup are seeded and deterministic',
  );
});

test('foam travels gently in coherent broken bands without whitening the open sea', () => {
  assert.equal(coastalFoamStrength(-1, 0.8, 2), 0);
  assert.equal(coastalFoamStrength(8, 0.8, 2), 0);
  assert.equal(coastalFoamStrength(0.4, 0, 2), 0);
  assert.notEqual(coastalFoamStrength(0.3, 0.8, 0), coastalFoamStrength(0.3, 0.8, 3));
  for (let t = 0; t < 10; t += 0.1) {
    const a = coastalFoamStrength(0.4, 0.8, t),
      b = coastalFoamStrength(0.4, 0.8, t + 0.01);
    assert.ok(a >= 0 && a <= 0.64);
    assert.ok(Math.abs(a - b) < 0.025);
  }
});
