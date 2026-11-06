const test = require('node:test'),
  assert = require('node:assert/strict');
const { getV5Hydrology, getV5BaseHydrology } = require('../.domain-build/domain/v5-hydrology');
const { createV5CoastSource } = require('../.domain-build/art/V5Coast');
const fixture = require('./fixtures/v5-natural-coast-quarter.json');
for (const expected of fixture.cases)
  test(`natural coast ${expected.seed}: independent feature oracle, full-cell solids and marine source`, () => {
    const h = getV5Hydrology(expected.seed),
      base = getV5BaseHydrology(expected.seed),
      coast = h.naturalCoast;
    assert.deepEqual(
      { ...h.feature, baseRevision: expected.feature.baseRevision },
      expected.feature,
    );
    assert.equal(h.feature.generatedObjects, 0);
    for (let u = -1; u <= 1; u += 0.125) assert.equal(coast.shore(u), 1);
    let changed = 0,
      newDry = 0;
    for (let z = 0; z < 192; z++)
      for (let x = 0; x < 192; x++) {
        const a = base.classifyCell(x, z),
          b = h.classifyCell(x, z);
        if (a.state !== b.state || a.seaDockWater !== b.seaDockWater) changed++;
        if (b.state === 'dryBuildable' && a.state !== 'dryBuildable') newDry++;
        if (coast.intersectsFeatureCell(x, z)) {
          assert.deepEqual(
            h.fields(x + 0.5, z + 0.5),
            base.fields(x + 0.5, z + 0.5),
            'base fields were forged',
          );
          if (b.seaDockWater) {
            assert.ok(h.isMarineOriginCell(x, z));
            for (const [dx, dz] of [
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
              [0.5, 0.5],
            ])
              assert.ok(h.sample(x + dx, z + dz, 'water').height <= -1.085 + 1e-9);
          } else assert.notEqual(b.state, 'dryBuildable');
        }
        if (
          x < h.featureBounds.x0 ||
          x >= h.featureBounds.x1 ||
          z < h.featureBounds.z0 ||
          z >= h.featureBounds.z1
        )
          assert.equal(h.sample(x + 0.5, z + 0.5).height, base.sample(x + 0.5, z + 0.5).height);
      }
    assert.equal(changed, expected.changedCells);
    assert.equal(newDry, expected.newDryCells);
    const [wx, wz] = coast.toWorld(0, 1);
    assert.equal(h.sample(wx, wz, 'land').height, 0.015);
    assert.ok(h.sample(wx, wz, 'water').height <= -1.3);
    assert.ok(h.boundaryCell(...coast.toWorld(0, 1).map(Math.floor)));
    assert.ok(Object.isFrozen(h.feature));
    assert.ok(Object.isFrozen(h.feature.anchor));
  });
function manifold(mesh, bounds) {
  const edges = new Map(),
    p = (i) => mesh.positions.slice(i * 3, i * 3 + 3);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3),
      pts = ids.map(p),
      u = pts[1].map((v, k) => v - pts[0][k]),
      v = pts[2].map((v, k) => v - pts[0][k]),
      n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
      normal = mesh.normals.slice(ids[0] * 3, ids[0] * 3 + 3);
    assert.ok(n.reduce((s, v, k) => s + v * normal[k], 0) > 1e-13);
    for (let j = 0; j < 3; j++) {
      const a = pts[j].join(','),
        b = pts[(j + 1) % 3].join(','),
        key = a < b ? a + '|' + b : b + '|' + a;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    assert.ok(count <= 2, 'nonmanifold ' + key);
    if (count === 1) {
      const [a, b] = key.split('|').map((p) => p.split(',').map(Number)),
        [x0, z0, x1, z1] = bounds;
      assert.ok(
        (a[0] === x0 && b[0] === x0) ||
          (a[0] === x1 && b[0] === x1) ||
          (a[2] === z0 && b[2] === z0) ||
          (a[2] === z1 && b[2] === z1),
        'crack ' + key,
      );
    }
  }
  assert.ok(mesh.positions.every(Number.isFinite));
  assert.ok(mesh.positions.length / 3 <= 65535);
}
for (const seed of [1, 17, 1937, 42173, 999999937, 1000000000])
  test(`natural cliff ${seed}: real chunk walls and reclamation replace rather than overlay`, () => {
    const h = getV5Hydrology(seed),
      c = h.naturalCoast,
      p = c.toWorld(0.5, 1.5),
      initialFill = { x: Math.floor(p[0]), z: Math.floor(p[1]) };
    const b = h.featureBounds,
      keys = [];
    for (let z = Math.floor(b.z0 / 16); z <= Math.floor((b.z1 - 0.001) / 16); z++)
      for (let x = Math.floor(b.x0 / 16); x <= Math.floor((b.x1 - 0.001) / 16); x++)
        keys.push(`${x},${z}`);
    for (const localFill of [null, [0.5, 1.5], [2.5, 0.5], [-2.5, 0.5]]) {
      const xy = localFill ? c.toWorld(...localFill) : null;
      const fill = xy ? { x: Math.floor(xy[0]), z: Math.floor(xy[1]) } : initialFill;
      const extensions = localFill ? [fill] : [];
      let source;
      try {
        source = createV5CoastSource(seed, extensions);
      } catch (error) {
        assert.ok(
          localFill && Math.abs(localFill[0]) > 1,
          'central native marine fill must remain legal',
        );
        assert.match(error.message, /扩地必须与小岛相连/); // Some shoulder cells require connecting reclamation first.
        continue;
      }
      let walls = 0;
      for (const key of keys) {
        const [cx, cz] = key.split(',').map(Number),
          m = source.build(key);
        manifold(m, [cx * 16, cz * 16, (cx + 1) * 16, (cz + 1) * 16]);
        for (let i = 0; i < m.indices.length; i += 3) {
          const pts = m.indices.slice(i, i + 3).map((j) => m.positions.slice(j * 3, j * 3 + 3));
          if (pts.some((p) => p[1] < -1.08) && Math.abs(m.normals[m.indices[i] * 3 + 1]) < 1e-12)
            walls++;
          const x = pts.reduce((s, p) => s + p[0], 0) / 3,
            z = pts.reduce((s, p) => s + p[2], 0) / 3,
            area =
              (pts[1][2] - pts[0][2]) * (pts[2][0] - pts[0][0]) -
              (pts[1][0] - pts[0][0]) * (pts[2][2] - pts[0][2]);
          if (
            extensions.length &&
            area > 0 &&
            x > fill.x + 1e-9 &&
            x < fill.x + 1 - 1e-9 &&
            z > fill.z + 1e-9 &&
            z < fill.z + 1 - 1e-9
          )
            assert.ok(
              pts.every((p) => p[1] === 0.015),
              'old coast remains inside fill',
            );
        }
      }
      assert.ok(walls > 0);
    }
  });
