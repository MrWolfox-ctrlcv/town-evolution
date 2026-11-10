const test = require('node:test');
const assert = require('node:assert/strict');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { part } = require('../.domain-build/art/AssetTypes');
const { assetBounds, compileAsset } = require('../.domain-build/art/MeshCompiler');
const { PLANT_SHAPES } = require('../.domain-build/art/PlantShapes');
const { CROWN } = require('../.domain-build/art/OrganicShapes');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const shapes = ['box', 'gable', 'gem', 'crown', 'timber', 'blade', ...Object.keys(PLANT_SHAPES)];
const recipe = (parts = []) => ({ id: 'bounds-test', footprint: [1, 1], parts });
test('cold asset catalog construction does not compile temporary render meshes', () => {
  execFileSync(
    process.execPath,
    [
      '-e',
      `
    const compiler = require('./.domain-build/art/MeshCompiler');
    compiler.compileAsset = () => { throw new Error('Unexpected temporary mesh'); };
    const { ASSETS } = require('./.domain-build/art/AssetCatalog');
    require('node:assert/strict').equal(Object.keys(ASSETS).length, 224);
  `,
    ],
    { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' },
  );
});
function expectedBounds(mesh, radius = false) {
  const bounds = { min: mesh.min, max: mesh.max };
  if (radius) {
    bounds.radius = 0;
    for (let i = 0; i < mesh.positions.length; i += 3)
      bounds.radius = Math.max(bounds.radius, Math.hypot(mesh.positions[i], mesh.positions[i + 2]));
  }
  return bounds;
}
function check(asset) {
  const before = structuredClone(asset),
    mesh = compileAsset(asset);
  assert.deepStrictEqual(assetBounds(asset), expectedBounds(mesh), asset.id);
  assert.deepStrictEqual(assetBounds(asset, true), expectedBounds(mesh, true), asset.id);
  assert.deepStrictEqual(asset, before, 'bounds must not mutate recipes or embedded meshes');
  assert.deepStrictEqual(compileAsset(asset), mesh, 'full mesh output must remain unchanged');
}
test('bounds and true XZ radius match every canonical asset, including procedural meshes', () => {
  assert.equal(Object.keys(ASSETS).length, 224);
  assert.equal(
    Object.values(ASSETS).reduce((sum, a) => sum + a.parts.length, 0),
    15116,
  );
  for (const asset of Object.values(ASSETS)) check(asset);
});
test('every shape preserves its actual deformed vertices under signed nonuniform XYZ transforms', () => {
  assert.equal(shapes.length, 16);
  const sizes = [
    [1, 1, 1],
    [0.17, 2.3, 0.51],
    [-2, 0.7, 1.1],
    [0.3, -1.4, -2.1],
  ];
  const rotations = [undefined, [0, 90, 0], [37, -113, 251], [-29, 53, -71]];
  for (const shape of shapes)
    for (const size of sizes)
      for (const rotation of rotations)
        check(recipe([part(shape, shape, [1.3, -0.7, 2.4], size, '#ABCDEF', rotation)]));
  check(
    recipe(
      shapes.map((shape, i) =>
        part(
          shape,
          shape,
          [i * 0.17, -i * 0.11, i * -0.23],
          sizes[i % sizes.length],
          '#ABCDEF',
          rotations[i % rotations.length],
        ),
      ),
    ),
  );
});
test('flat faces omit unreferenced vertices while smooth meshes include them', () => {
  for (const geometry of [CROWN, PLANT_SHAPES.grain]) {
    geometry.vertices.push([113, 127, 149]);
    try {
      const shape = geometry === CROWN ? 'crown' : 'grain';
      const asset = recipe([part(shape, shape, [0, 0, 0], [1, 1, 1], '#ABCDEF')]);
      check(asset);
      assert.equal(assetBounds(asset).max[0] > 100, geometry === PLANT_SHAPES.grain);
    } finally {
      geometry.vertices.pop();
    }
  }
});
test('empty recipes and embedded mesh bounds retain prior values and independent arrays', () => {
  check(recipe());
  const mesh = {
    positions: [3, 2, 4],
    normals: [],
    colors: [],
    indices: [],
    min: [-7, -8, -9],
    max: [7, 8, 9],
  };
  const asset = { ...recipe([part('ignored', 'box', [0, 0, 0], [0, 0, 0], '#FFFFFF')]), mesh };
  check(asset);
  const first = assetBounds(asset, true),
    second = assetBounds(asset);
  assert.equal(first.radius, 5, 'radius uses positions, not stored AABB corners');
  assert.notEqual(first.min, mesh.min);
  assert.notEqual(first.max, mesh.max);
  assert.notEqual(first.min, second.min);
  first.min[0] = -999;
  assert.deepStrictEqual(second, { min: [-7, -8, -9], max: [7, 8, 9] });
});
test('bounds-only mode never reads appearance data or embedded positions unless radius is requested', () => {
  const p = part('bare', 'box', [0, 0, 0], [1, 2, 3], '#FFFFFF');
  for (const field of ['color', 'texture'])
    Object.defineProperty(p, field, {
      get() {
        throw new Error(field);
      },
    });
  assert.deepStrictEqual(assetBounds(recipe([p])), { min: [-0.5, -1, -1.5], max: [0.5, 1, 1.5] });
  const mesh = { min: [1, 2, 3], max: [4, 5, 6] };
  for (const field of ['positions', 'normals', 'colors', 'indices', 'uvs', 'texturedIndices'])
    Object.defineProperty(mesh, field, {
      get() {
        throw new Error(field);
      },
    });
  assert.deepStrictEqual(assetBounds({ ...recipe(), mesh }), { min: [1, 2, 3], max: [4, 5, 6] });
});
test('flat degeneracy errors and smooth zero-scale behavior match the full compiler', () => {
  for (const shape of shapes)
    for (const size of [
      [0, 0, 0],
      [0, 1, 1],
      [1e-8, 1e-8, 1e-8],
      [1e-5, 1e-5, 1e-5],
    ]) {
      const asset = recipe([part(shape, shape, [0, 0, 0], size, '#ABCDEF', [37, -113, 251])]);
      let mesh;
      try {
        mesh = compileAsset(asset);
      } catch (error) {
        for (const radial of [false, true])
          assert.throws(() => (radial ? assetBounds(asset, true) : assetBounds(asset)), {
            name: error.name,
            message: error.message,
          });
        continue;
      }
      assert.deepStrictEqual(assetBounds(asset, true), expectedBounds(mesh, true));
    }
});
