const test = require('node:test'),
  assert = require('node:assert/strict');
const { islandTerrain } = require('../.domain-build/art/IslandTerrain');
const { isLandCell, landCellCount } = require('../.domain-build/domain/island');
const build = (seed) => islandTerrain(24, seed, (x, z) => isLandCell(x, z, seed));
test('saved terrain seed is deterministic and each seeded legal mask exactly matches its meadow triangles', () => {
  assert.deepEqual(build(42173), build(42173));
  assert.notDeepEqual(build(42173).positions, build(1).positions);
  assert.notDeepEqual(build(42173).colors, build(1).colors);
  const masks = new Set();
  for (const seed of [1, 2, 17, 73129, 81231, 42173, 2147483647]) {
    const m = build(seed),
      count = landCellCount(seed),
      rendered = new Set(),
      legal = new Set();
    for (let x = 0; x < 24; x++)
      for (let z = 0; z < 24; z++) if (isLandCell(x, z, seed)) legal.add(`${x},${z}`);
    masks.add([...legal].join(';'));
    for (let i = 18; i < 18 + count * 18; i += 18) {
      const x = (m.positions[i] + m.positions[i + 3] + m.positions[i + 6]) / 3;
      const z = (m.positions[i + 2] + m.positions[i + 5] + m.positions[i + 8]) / 3;
      const key = `${Math.floor(x)},${Math.floor(z)}`;
      assert.equal(legal.has(key), true, `water rendered as grass, seed ${seed}`);
      assert.equal(rendered.has(key), false, `duplicate tile ${key}`);
      rendered.add(key);
      for (let j = 1; j < 18; j += 3) assert.equal(m.positions[i + j], 0.015);
    }
    assert.deepEqual(rendered, legal);
    assert.equal(rendered.size, count);
  }
  assert.ok(masks.size > 1, 'seed must change playable coastline, not only paint');
});
test('natural terrain meshes remain finite, compact and upward-facing over a broad seed sweep', () => {
  for (const seed of [42173, ...Array.from({ length: 30 }, (_, i) => i * 193 + 1)]) {
    const m = build(seed);
    assert.ok(m.positions.length / 3 < 6000, `vertex budget ${seed}`);
    assert.ok(m.indices.length / 3 < 2000, `triangle budget ${seed}`);
    assert.ok([...m.positions, ...m.normals, ...m.colors].every(Number.isFinite));
    assert.ok(m.colors.every((n) => n >= 0 && n <= 1));
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, b, c] = m.indices.slice(i, i + 3).map((n) => m.positions.slice(n * 3, n * 3 + 3));
      const u = b.map((n, j) => n - a[j]),
        v = c.map((n, j) => n - a[j]);
      assert.ok(u[2] * v[0] - u[0] * v[2] > 0, `backface seed ${seed} triangle ${i / 3}`);
      assert.ok(
        Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ) > 1e-8,
      );
    }
  }
});
