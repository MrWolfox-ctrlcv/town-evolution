const test = require('node:test'),
  assert = require('node:assert/strict');
const { createCoastPolygon } = require('../.domain-build/domain/v7-polygon-field');
const { createV7WaterFields } = require('../.domain-build/domain/v7-coast-fields');
function inside(p, x, z) {
  let yes = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i],
      b = p[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
      yes = !yes;
  }
  return yes;
}
function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
test('Perlin coast polygons are simple closed stars with independent ray parity', () => {
  for (const seed of [1, 7, 42173, 1e9])
    for (const polygon of Object.values(createV7WaterFields(seed).coastPolygons)) {
      const p = polygon.points,
        n = p.length;
      assert.ok(n <= 96);
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          if (j === i + 1 || (i === 0 && j === n - 1)) continue;
          const a = p[i],
            b = p[(i + 1) % n],
            c = p[j],
            d = p[(j + 1) % n];
          assert.ok(
            !(cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0),
            'nonadjacent segments cannot intersect',
          );
        }
      for (let z = -2; z <= 194; z += 3.125)
        for (let x = -2; x <= 194; x += 3.75) {
          const d = polygon.insideDistance(x, z);
          if (Math.abs(d) > 1e-5) assert.equal(d > 0, inside(p, x, z));
        }
    }
});
test('signed distance agrees at polygon vertices, edge normals, axis seams and Lipschitz pairs', () => {
  const polygons = [
    createCoastPolygon(1, 0, 0, 10, 10, 0, 0, 16),
    ...Object.values(createV7WaterFields(42173).coastPolygons),
  ];
  for (const q of polygons) {
    const p = q.points;
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz),
        m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      assert.ok(Math.abs(q.insideDistance(...a)) < 1e-10);
      assert.ok(Math.abs(q.insideDistance(...m)) < 1e-10);
      for (const e of [2e-5, 0.001]) {
        assert.ok(q.insideDistance(m[0] - (dz / length) * e, m[1] + (dx / length) * e) > 0);
        assert.ok(q.insideDistance(m[0] + (dz / length) * e, m[1] - (dx / length) * e) < 0);
      }
      for (const [dx, dz] of [
        [1e-6, 0],
        [-1e-6, 0],
        [0, 1e-6],
        [0, -1e-6],
      ])
        assert.ok(Math.abs(q.insideDistance(a[0] + dx, a[1] + dz)) <= 1.00001e-6);
    }
    for (let i = 0; i < 2000; i++) {
      const x = ((i * 71) % 199) - 3,
        z = ((i * 43) % 197) - 3,
        dx = Math.sin(i) * 0.7,
        dz = Math.cos(i) * 0.7;
      assert.ok(
        Math.abs(q.insideDistance(x, z) - q.insideDistance(x + dx, z + dz)) <=
          Math.hypot(dx, dz) + 1e-9,
      );
    }
  }
  assert.throws(() => createCoastPolygon(1, 0, 0, 1, 1, 0, 1, 16));
  assert.throws(() => createCoastPolygon(1, 0, 0, 10, 10, 0, 0, 3));
  assert.throws(() => polygons[0].insideDistance(Infinity, 0));
  assert.throws(() => createCoastPolygon(1, 0, 0, 1e-160, 1e-160, 0, 0, 16));
});
test('each accepted test seed has an analytic whole-edge water bound without vertex clipping', () => {
  for (const seed of [1, 7, 42173, 1e9]) {
    const s = createV7WaterFields(seed);
    assert.ok(s.coastBoundaryUpper <= -2.25);
  }
});
