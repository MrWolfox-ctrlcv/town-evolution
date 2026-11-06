const test = require('node:test'),
  assert = require('node:assert/strict');
const { v5DisplayNormal, v5DisplayColor } = require('../.domain-build/art/V5SurfaceStyle');
const { V5ResourceField } = require('../.domain-build/art/V5ResourceField');
const { ContinuousField } = require('../.domain-build/art/ContinuousField');
const V5SurfaceCompatField = V5ResourceField;
const { resourcePatch } = require('../.domain-build/art/ResourcePatch');
const { getV5World } = require('../.domain-build/domain/v5-world');
test('normal matches actual six-triangle area sum, including arbitrary plane slopes', () => {
  for (const [dx, dz] of [
    [0, 0],
    [1, 2],
    [-4, 0.3],
    [9, -8],
  ]) {
    let n = v5DisplayNormal((x, z) => 12 + x * dx + z * dz, 11, 13);
    const d = Math.hypot(dx, 1, dz);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(n[k] - [-dx / d, 1 / d, -dz / d][k]) < 1e-12);
  }
  const h = (x, z) => 2 + x * x * 0.3 + Math.sin(z * 3) + Math.cos(x * 7 + z * 5);
  const x = 11,
    z = 13,
    e = 0.25,
    vertices = [
      [-e, -e],
      [-e, 0],
      [0, 0],
      [0, -e],
      [e, 0],
      [e, e],
      [0, e],
    ].map(([dx, dz]) => [dx, h(x + dx, z + dz), dz]);
  const n = [0, 0, 0];
  for (const ids of [
    [0, 1, 2],
    [0, 2, 3],
    [3, 2, 4],
    [1, 6, 2],
    [2, 6, 5],
    [2, 5, 4],
  ]) {
    const [a, b, c] = ids.map((i) => vertices[i]),
      u = b.map((v, k) => v - a[k]),
      v = c.map((q, k) => q - a[k]);
    n[0] += u[1] * v[2] - u[2] * v[1];
    n[1] += u[2] * v[0] - u[0] * v[2];
    n[2] += u[0] * v[1] - u[1] * v[0];
  }
  const d = Math.hypot(...n),
    actual = v5DisplayNormal(h, x, z);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(actual[k] - n[k] / d) < 1e-12);
});
test('natural soil remains green on flat, sloped and extreme faces; sampled colors bounded', () => {
  for (const seed of [1, 17, 42173, 1000000000])
    for (let x = 0; x < 192; x += 7)
      for (let z = 0; z < 192; z += 11)
        for (const kind of ['soil', 'stone'])
          for (const ny of [0, 0.2, 0.7, 1]) {
            const c = v5DisplayColor(seed, { kind }, x, z, (x + z) % 43, [
              Math.sqrt(1 - ny * ny),
              ny,
              0,
            ]);
            assert.ok(c.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
            if (kind === 'soil') assert.ok(c[1] > c[0] && c[0] > c[2]);
          }
});
test('v5 display change preserves six-seed intact, partial-cut and depleted-neighbor geometry and inventory', () => {
  for (const seed of [1, 17, 73129, 42173, 1937, 1000000000]) {
    const w = getV5World(seed),
      resources = w.recipe.resourcesForNewWorld(),
      initial = JSON.stringify(resources),
      a = new V5ResourceField(seed),
      b = new V5SurfaceCompatField(seed);
    a.normal = ContinuousField.prototype.normal;
    a.color = ContinuousField.prototype.color;
    const samples = resources.filter((_, i) => i % Math.ceil(resources.length / 40) === 0);
    const changed = resources
      .map((r) =>
        samples.some((s) => s.id === r.id) ? { ...r, amount: Math.max(0, r.amount - 2) } : r,
      )
      .filter((r) => r.amount > 0);
    for (const state of [resources, changed]) {
      a.sync(state);
      b.sync(state);
      for (const r of samples) {
        const now = state.find((v) => v.id === r.id);
        if (!now) continue;
        const ma = resourcePatch(a, now),
          mb = resourcePatch(b, now);
        assert.deepEqual(ma.positions, mb.positions);
        assert.deepEqual(ma.indices, mb.indices);
        assert.deepEqual(ma.min, mb.min);
        assert.deepEqual(ma.max, mb.max);
        for (let v = 0; v < ma.positions.length / 3; v++) {
          if (ma.normals[v * 3 + 1] === 0) {
            assert.deepEqual(
              ma.normals.slice(v * 3, v * 3 + 3),
              mb.normals.slice(v * 3, v * 3 + 3),
            );
            assert.deepEqual(ma.colors.slice(v * 4, v * 4 + 4), mb.colors.slice(v * 4, v * 4 + 4));
          }
        }
      }
    }
    assert.equal(JSON.stringify(resources), initial);
  }
});
test('natural normals/colors match exactly at duplicate cell and chunk edge vertices', () => {
  const seed = 42173,
    w = getV5World(seed),
    resources = w.recipe.resourcesForNewWorld(),
    f = new V5SurfaceCompatField(seed);
  f.sync(resources);
  const seen = new Map();
  let repeated = 0;
  for (const r of resources.filter((r) => r.x >= 62 && r.x <= 65 && r.z >= 62 && r.z <= 65)) {
    const m = resourcePatch(f, r);
    for (let v = 0; v < m.positions.length / 3; v++) {
      const key = m.positions.slice(v * 3, v * 3 + 3).join(','),
        attrib = [...m.normals.slice(v * 3, v * 3 + 3), ...m.colors.slice(v * 4, v * 4 + 4)],
        old = seen.get(key);
      if (old) {
        assert.deepEqual(attrib, old);
        repeated++;
      } else seen.set(key, attrib);
    }
  }
  assert.ok(repeated > 50);
});
