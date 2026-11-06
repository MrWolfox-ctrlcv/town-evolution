/** Exact CPU triangle support. This does not exercise a GPU or a device. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { SurfaceSupport } = require('../.domain-build/application/SurfaceSupport');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const rect = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
test('rectangle clipping finds the exact support on a sloped triangle without including outside vertices', () => {
  const positions = [0, 0, 0, 1, 1, 0, 0, 2, 1],
    indices = [0, 2, 1];
  const saved = JSON.stringify([positions, indices]);
  const support = new SurfaceSupport(positions, indices);
  close(support.height(rect(0.2, 0.4, 0.2, 0.4)), 1.2);
  close(support.height(rect(0.2, 0.2, 0.2, 0.2)), 0.6);
  close(support.height(rect(0.05, 0.05, 0.1, 0.1)), 0.25);
  close(support.height(rect(0.05, 0.05, 0.1, 0.2)), 0.45);
  assert.equal(support.height(rect(1.1, 1.3, 1.1, 1.3)), null);
  assert.equal(JSON.stringify([positions, indices]), saved);
});
test('a narrow peak inside the rectangle is found even when center and four corners miss it', () => {
  const support = new SurfaceSupport([0.04, 5, 0.04, 0.08, 5, 0.04, 0.04, 5, 0.08], [0, 2, 1]);
  assert.equal(support.height(rect(-0.14, 0.14, -0.14, 0.14)), 5);
  assert.equal(support.height(rect(0, 0, 0, 0)), null);
});
test('downward faces and vertical walls never lift goods, and negative unit cells are indexed', () => {
  const support = new SurfaceSupport(
    [
      -2, 3, -2, -1, 3, -2, -2, 3, -1, -2, 30, -2, -1, 30, -2, -2, 30, -1, -1.5, 0, -2, -1.5, 30,
      -2, -1.5, 0, -1,
    ],
    [0, 2, 1, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(support.height(rect(-1.7, -1.6, -1.7, -1.6)), 3);
  assert.equal(support.height(rect(NaN, 1, 0, 1)), null);
  assert.equal(support.height(rect(1, 0, 0, 1)), null);
});
test('canonical farm support uses the actual bed/ridge/water triangles in all four rotations', () => {
  for (const id of [
    'farm-cell-bed',
    'farm-cell-bed-water',
    'farm-large-bed',
    'farm-large-bed-water',
  ]) {
    const mesh = compileAsset(ASSETS[id]);
    for (let rotation = 0; rotation < 4; rotation++) {
      const positions = [];
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i],
          z = mesh.positions[i + 2];
        positions.push([x, z, -x, -z][rotation], mesh.positions[i + 1], [z, -x, -z, x][rotation]);
      }
      const support = new SurfaceSupport(positions, mesh.indices);
      const center = support.height(rect(-0.14, 0.14, -0.14, 0.14));
      assert.ok(center >= 0.17 && center <= 0.187, `${id}/${rotation}/${center}`);
      if (id.endsWith('-water')) close(center, 0.18);
    }
  }
});

test('off-center field cells keep exact bed support after translation and every quarter turn', () => {
  const { load } = require('./helpers/selection-ui.cjs');
  const { DropSupport } = load('DropSupport');
  for (const size of [3, 6])
    for (const irrigated of [false, true]) {
      const span = (size * 2) / 3;
      const id = `farm-${size === 6 ? 'large' : 'cell'}-bed${irrigated ? '-water' : ''}`;
      const mesh = compileAsset(ASSETS[id]);
      const local = new SurfaceSupport(mesh.positions, mesh.indices);
      for (let rotation = 0; rotation < 4; rotation++) {
        const farm = {
          id: 'field',
          kind: 'farm',
          x: 13,
          z: 17,
          rotation,
          farmSize: size,
          irrigated,
        };
        const support = new DropSupport();
        support.setFarms([farm]);
        for (const cell of [0, size - 1, size, size * size - 1]) {
          const x = (((cell % size) + 0.5) * 2) / 3 - span / 2 + 0.11;
          const z = ((Math.floor(cell / size) + 0.5) * 2) / 3 - span / 2 - 0.17;
          for (const [dx, dz] of [
            [0.08, 0.04],
            [0, 0],
            [0, 0.04],
            [0.08, 0],
          ]) {
            const query = rect(x - dx, x + dx, z - dz, z + dz);
            const expected = local.height(query);
            assert.notEqual(expected, null, `${id}/${cell}`);
            const corners = [];
            for (const px of [query.minX, query.maxX])
              for (const pz of [query.minZ, query.maxZ])
                corners.push({
                  x: farm.x + span / 2 + [px, pz, -px, -pz][rotation],
                  z: farm.z + span / 2 + [pz, -px, -pz, px][rotation],
                });
            close(
              support.height(
                rect(
                  Math.min(...corners.map((p) => p.x)),
                  Math.max(...corners.map((p) => p.x)),
                  Math.min(...corners.map((p) => p.z)),
                  Math.max(...corners.map((p) => p.z)),
                ),
              ),
              expected,
            );
          }
        }
      }
    }
});
