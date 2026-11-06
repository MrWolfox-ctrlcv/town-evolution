const test = require('node:test'),
  assert = require('node:assert/strict');
const { getV5Hydrology, getV5BaseHydrology } = require('../.domain-build/domain/v5-hydrology');
const { createV5CoastSource, v5CoastChunkBounds } = require('../.domain-build/art/V5Coast');
const fixture = require('./fixtures/v5-hydrology-lab.json');
const { find } = require('./helpers/v5-coastal-dock.cjs');
for (const c of fixture)
  test(`v5 pre-feature base hydrology exact lab oracle and full-cell certificates ${c.seed}`, () => {
    const f = getV5BaseHydrology(c.seed),
      counts = {};
    for (const p of c.points) {
      assert.deepEqual(f.sample(p.x, p.z), p.sample);
    }
    for (const key of ['summits', 'hills', 'forests', 'lake', 'river', 'bays'])
      assert.deepEqual(f.metadata[key], c.metadata[key]);
    for (let z = 0; z < f.size; z++)
      for (let x = 0; x < f.size; x++) {
        const cell = f.classifyCell(x, z);
        counts[cell.state] = (counts[cell.state] || 0) + 1;
        if (cell.state === 'dryBuildable')
          for (const [dx, dz] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
            [0.5, 0.5],
          ])
            assert.ok(f.fields(x + dx, z + dz).dry >= 0.15 - 1e-12);
        if (cell.seaDockWater)
          assert.ok(f.fields(x + 0.5, z + 0.5).freshwater + Math.SQRT1_2 <= -1);
      }
    assert.deepEqual(counts, c.counts);
    assert.equal(f.at(-1, 0), null);
    assert.equal(f.at(192, 0), null);
    assert.equal(f.classifyCell(-16, -16).state, 'clearWater');
    assert.notDeepEqual(f.classifyCell(-1, 1), f.classifyCell(191, 0));
    assert.ok(f.cacheSizes().samples <= 8192 && f.cacheSizes().cells <= 4096);
    assert.ok(Object.isFrozen(f.sample(2, 3)));
    assert.ok(Object.isFrozen(f.metadata.lake));
  });
function point(m, i) {
  return m.positions.slice(i * 3, i * 3 + 3);
}
function edges(m) {
  const e = new Map();
  for (let i = 0; i < m.indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      let a = point(m, m.indices[i + k]).join(','),
        b = point(m, m.indices[i + ((k + 1) % 3)]).join(',');
      const key = a < b ? a + '|' + b : b + '|' + a;
      e.set(key, (e.get(key) || 0) + 1);
    }
  }
  return e;
}
function checkMesh(m) {
  assert.ok(m.positions.length / 3 <= 65535);
  for (const values of [m.positions, m.normals, m.colors]) assert.ok(values.every(Number.isFinite));
  for (const i of m.indices) assert.ok(Number.isInteger(i) && i >= 0 && i < m.positions.length / 3);
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = m.indices.slice(i, i + 3).map((j) => point(m, j)),
      u = b.map((v, k) => v - a[k]),
      v = c.map((v, k) => v - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
      normal = m.normals.slice(m.indices[i] * 3, m.indices[i] * 3 + 3);
    assert.ok(n.reduce((s, v, k) => s + v * normal[k], 0) > 0);
  }
}
test('direct chunks preserve finite winding, Uint16, welded internal boundaries and identical interchunk normals', () => {
  const s = createV5CoastSource(42173);
  assert.equal(s.keys.length, 196);
  let triangles = 0;
  const borders = new Map();
  for (const key of s.keys) {
    const m = s.build(key),
      [x0, z0, x1, z1] = v5CoastChunkBounds(key);
    checkMesh(m);
    triangles += m.indices.length / 3;
    for (const [edge, count] of edges(m)) {
      assert.ok(count <= 2);
      if (count === 1) {
        const [a, b] = edge.split('|').map((p) => p.split(',').map(Number));
        assert.ok(
          (a[0] === x0 && b[0] === x0) ||
            (a[0] === x1 && b[0] === x1) ||
            (a[2] === z0 && b[2] === z0) ||
            (a[2] === z1 && b[2] === z1),
          'internal crack ' + key + ' ' + edge,
        );
      }
    }
    for (let i = 0; i < m.positions.length / 3; i++) {
      const p = point(m, i);
      if (p[0] !== x0 && p[0] !== x1 && p[2] !== z0 && p[2] !== z1) continue;
      const id = p.join(','),
        n = m.normals.slice(i * 3, i * 3 + 3);
      if (Math.abs(n[1]) < 1e-12) continue; // Intentional hard-normal cliff wall seam.
      if (borders.has(id)) assert.deepEqual(n, borders.get(id));
      else borders.set(id, n);
    }
  }
  assert.ok(triangles < 350000, `actual ${triangles}; dense baseline 1605632`);
  checkMesh(s.water);
});
test('validated reclamation removes old top, emits real vertical walls, and does not admit freshwater', () => {
  const seed = 42173,
    plan = find(seed),
    s = createV5CoastSource(seed, plan.fill),
    set = new Set(plan.fill.map((p) => `${p.x},${p.z}`));
  let walls = 0;
  for (const key of new Set(
    plan.fill.map((p) => `${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`),
  )) {
    const m = s.build(key);
    checkMesh(m);
    const [x0, z0, x1, z1] = v5CoastChunkBounds(key);
    for (const [edge, count] of edges(m)) {
      assert.ok(count <= 2, 'nonmanifold fill edge');
      if (count === 1) {
        const [a, b] = edge.split('|').map((p) => p.split(',').map(Number));
        assert.ok(
          (a[0] === x0 && b[0] === x0) ||
            (a[0] === x1 && b[0] === x1) ||
            (a[2] === z0 && b[2] === z0) ||
            (a[2] === z1 && b[2] === z1),
          'fill crack ' + edge,
        );
      }
    }
    for (let i = 0; i < m.indices.length; i += 3) {
      const pts = m.indices.slice(i, i + 3).map((j) => point(m, j)),
        cx = pts.reduce((s, p) => s + p[0], 0) / 3,
        cz = pts.reduce((s, p) => s + p[2], 0) / 3;
      const area =
        (pts[1][2] - pts[0][2]) * (pts[2][0] - pts[0][0]) -
        (pts[1][0] - pts[0][0]) * (pts[2][2] - pts[0][2]);
      if (area > 0 && set.has(`${Math.floor(cx)},${Math.floor(cz)}`))
        assert.ok(
          pts.every((p) => p[1] === 0.015),
          'old bed not removed',
        );
      if (Math.abs(area) < 1e-12 && pts.some((p) => p[1] < -0.62)) {
        walls++;
        assert.ok(pts.every((p) => p[1] <= 0.015)); // Vertically subdivided walls need not reach the cap in every triangle.
      }
    }
  }
  assert.ok(walls > 0);
  assert.throws(() => createV5CoastSource(seed, [{ x: 119, z: 126 }]));
});
test('cooperative coast job yields before publication and exactly matches synchronous geometry', () => {
  const source = createV5CoastSource(42173),
    job = source.begin('11,10');
  assert.throws(() => job.result());
  assert.throws(() => job.advance(0));
  assert.equal(job.advance(1), false);
  let steps = 1;
  while (!job.advance(8)) steps++;
  assert.ok(steps > 100);
  assert.deepEqual(job.result(), source.build('11,10'));
  assert.equal(job.advance(1), true);
});
