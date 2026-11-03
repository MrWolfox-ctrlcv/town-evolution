const test = require('node:test');
const assert = require('node:assert/strict');
const { ASSETS, cropStage } = require('../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
test('all canonical assets compile into finite indexed vertex-colored meshes within budgets', () => {
  assert.equal(Object.keys(ASSETS).length, 63);
  for (const asset of Object.values(ASSETS)) {
    const m = compileAsset(asset),
      n = m.positions.length / 3;
    assert.equal(m.normals.length, n * 3);
    assert.equal(m.colors.length, n * 4);
    // A pile merges up to five harvested units into one cached draw call.
    const budget = asset.id.startsWith('pile-')
      ? 6000
      : asset.id.startsWith('crop-cell-')
        ? 6500
        : 1500;
    assert.ok(m.indices.length / 3 < budget, asset.id);
    assert.ok(n < 6000, asset.id);
    assert.ok([...m.positions, ...m.normals, ...m.colors].every(Number.isFinite), asset.id);
    assert.ok(
      m.colors.every((v) => v >= 0 && v <= 1),
      asset.id,
    );
    assert.ok(
      m.indices.every((v) => Number.isInteger(v) && v >= 0 && v < n),
      asset.id,
    );
    for (let i = 0; i < m.normals.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...m.normals.slice(i, i + 3)) - 1) < 1e-6);
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, b, c] = m.indices.slice(i, i + 3).map((v) => m.positions.slice(v * 3, v * 3 + 3));
      const u = b.map((v, j) => v - a[j]),
        v = c.map((v, j) => v - a[j]);
      assert.ok(
        Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ) > 1e-8,
        asset.id,
      );
    }
  }
});
test('all gameplay assets fit existing occupied cell bounds without changing economic footprint', () => {
  for (const id of [
    'shop',
    'order-board',
    'dock',
    'warehouse-base',
    'warehouse-expanded',
    'warehouse-cold',
    'cooler',
    'farm-empty',
    'farm-seedling',
    'farm-ready',
  ]) {
    const asset = ASSETS[id],
      m = compileAsset(asset);
    assert.ok(m.min[0] >= -asset.footprint[0] / 2 && m.max[0] <= asset.footprint[0] / 2, id);
    assert.ok(m.min[2] >= -asset.footprint[1] / 2 && m.max[2] <= asset.footprint[1] / 2, id);
    assert.ok(m.min[1] >= -1e-6, id);
  }
});
test('warehouse evolution retains identical shell roof and main door scale', () => {
  const base = ASSETS['warehouse-base'];
  for (const id of ['warehouse-expanded', 'warehouse-cold']) {
    const variant = ASSETS[id];
    for (const name of ['cream-walls', 'terracotta-gable', 'roof-ridge', 'loading-deck'])
      assert.deepEqual(
        variant.parts.find((p) => p.name === name),
        base.parts.find((p) => p.name === name),
      );
    assert.deepEqual(
      variant.parts.find((p) => p.name === 'teal-double-door').size,
      base.parts.find((p) => p.name === 'teal-double-door').size,
    );
  }
});
test('farm visual stages follow task readiness without mutating business state', () => {
  const job = { readyAt: 100 };
  assert.equal(cropStage(undefined, 100), 'empty');
  assert.equal(cropStage(job, 99), 'seedling');
  assert.equal(cropStage(job, 100), 'ready');
  assert.deepEqual(job, { readyAt: 100 });
});
test('exported glTF buffers and accessors are self-contained and agree with canonical geometry', () => {
  const fs = require('node:fs');
  for (const asset of Object.values(ASSETS)) {
    const g = JSON.parse(fs.readFileSync(`art/exports/${asset.id}.gltf`, 'utf8'));
    const bytes = Buffer.from(g.buffers[0].uri.split(',')[1], 'base64');
    assert.equal(g.asset.version, '2.0');
    assert.equal(bytes.length, g.buffers[0].byteLength);
    assert.equal(g.meshes.length, 1);
    assert.equal(g.meshes[0].primitives.length, 1);
    assert.equal(g.materials.length, 1);
    const expected = compileAsset(asset);
    for (const [i, field] of ['positions', 'normals', 'colors', 'indices'].entries()) {
      const a = g.accessors[i],
        view = g.bufferViews[a.bufferView];
      assert.equal(view.byteOffset % 4, 0);
      assert.ok(view.byteOffset + view.byteLength <= bytes.length);
      const size = { VEC3: 3, VEC4: 4, SCALAR: 1 }[a.type];
      assert.equal(a.count * size, expected[field].length);
      assert.equal(view.byteLength, expected[field].length * 4);
      for (let j = 0; j < expected[field].length; j++) {
        const actual =
          a.componentType === 5125
            ? bytes.readUInt32LE(view.byteOffset + j * 4)
            : bytes.readFloatLE(view.byteOffset + j * 4);
        assert.ok(
          Math.abs(
            actual -
              (field === 'colors' && j % 4 !== 3
                ? expected[field][j] <= 0.04045
                  ? expected[field][j] / 12.92
                  : ((expected[field][j] + 0.055) / 1.055) ** 2.4
                : expected[field][j]),
          ) < 1e-6,
          asset.id + '/' + field,
        );
      }
    }
  }
});
test('commerce silhouettes share the palette and retain the modular shop core', () => {
  for (const name of ['cream-walls', 'terracotta-gable', 'roof-ridge', 'loading-deck'])
    assert.deepEqual(
      ASSETS.shop.parts.find((p) => p.name === name),
      ASSETS['warehouse-base'].parts.find((p) => p.name === name),
    );
  assert.equal(ASSETS.shop.parts.filter((p) => p.name === 'awning-stripe').length, 5);
  assert.equal(ASSETS['order-board'].parts.filter((p) => p.name === 'paper').length, 3);
  assert.equal(ASSETS.dock.parts.filter((p) => p.name === 'bollard').length, 4);
  assert.ok(compileAsset(ASSETS['order-board']).max[0] < 0.5);
});
test('rounded tree keeps the harvest footprint and hit box with one compact mesh', () => {
  const tree = ASSETS.tree,
    m = compileAsset(tree);
  assert.deepEqual(tree.footprint, [1.2, 1.2]);
  assert.ok(m.min[0] >= -0.6 && m.max[0] <= 0.6);
  assert.ok(m.min[2] >= -0.6 && m.max[2] <= 0.6);
  assert.ok(m.min[1] >= 0 && m.max[1] <= 2);
  assert.ok(m.max[1] * 0.8 <= 1.6);
  assert.ok(m.indices.length / 3 <= 400);
  assert.equal(tree.parts.filter((p) => p.shape === 'crown').length, 4);
  assert.equal(tree.parts.filter((p) => p.name.startsWith('branch-')).length, 2);
});
test('organic polyhedra face outward and have closed manifold topology', () => {
  const { CROWN, TIMBER } = require('../.domain-build/art/OrganicShapes');
  for (const shape of [CROWN, TIMBER]) {
    const edges = new Map();
    for (const face of shape.faces) {
      const [a, b, c] = face.slice(0, 3).map((i) => shape.vertices[i]);
      const u = b.map((v, i) => v - a[i]),
        v = c.map((v, i) => v - a[i]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      assert.ok(n.reduce((sum, x, i) => sum + x * a[i], 0) > 0);
      for (let i = 0; i < face.length; i++) {
        const a = face[i],
          b = face[(i + 1) % face.length],
          key = [Math.min(a, b), Math.max(a, b)].join(':');
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert.ok([...edges.values()].every((n) => n === 2));
  }
});
