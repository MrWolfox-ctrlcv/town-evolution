const test = require('node:test');
const assert = require('node:assert/strict');
const { riceGeometry, riceProductUnit } = require('../.domain-build/art/RiceGeometry');
const {
  stoneMillParts,
  stoneMill,
  mill,
  grainProductUnit,
} = require('../.domain-build/art/RiceMillKit');
const { houseCore } = require('../.domain-build/art/BuildingCore');
const { move } = require('../.domain-build/art/AssetTypes');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');

test('rice has three distinct growing silhouettes and only mature clumps carry drooping panicles', () => {
  const stages = ['seedling', 'young', 'ready'].map((stage) => ({
    id: `rice-${stage}`,
    footprint: [2 / 3, 2 / 3],
    parts: riceGeometry(stage),
  }));
  const meshes = stages.map(compileAsset);
  assert.ok(meshes[0].max[1] < meshes[1].max[1]);
  assert.ok(meshes[1].max[1] < meshes[2].max[1]);
  assert.equal(new Set(stages.map((recipe) => JSON.stringify(recipe.parts))).size, 3);
  for (const recipe of stages.slice(0, 2))
    assert.ok(!recipe.parts.some((p) => p.name.includes('panicle') || p.name.includes('grain')));
  assert.equal(stages[2].parts.filter((p) => p.name === 'rice-drooping-panicle').length, 36);
  assert.equal(stages[2].parts.filter((p) => p.name === 'rice-hanging-grain').length, 216);
  assert.ok(!stages[2].parts.some((p) => p.name.startsWith('wheat-')));
  assert.deepEqual(stages[2].parts, riceGeometry('ready'));
  for (const mesh of meshes) {
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.ok(mesh.normals.every(Number.isFinite));
    assert.ok(mesh.max[0] - mesh.min[0] <= 0.8, 'clumps remain local to their planted cell');
    assert.ok(mesh.indices.length / 3 < 7000, 'rice stays within the shared crop mesh budget');
  }
});

test('mill preserves every house part and visibly reuses the separate stone mill component', () => {
  const recipe = mill();
  assert.deepEqual(recipe.parts.slice(0, houseCore().length), houseCore());
  const component = move(stoneMillParts(), [0.66, 0.16, 0.22], 0.65);
  for (const p of component)
    assert.ok(recipe.parts.some((candidate) => JSON.stringify(candidate) === JSON.stringify(p)));
  for (const name of [
    'mill-lower-stone',
    'mill-upper-stone',
    'mill-crank-handle',
    'mill-shelter-roof',
  ])
    assert.ok(
      recipe.parts.some((p) => p.name === name),
      name,
    );
});

test('stone mill and house upgrade retain their collision footprints in all four rotations', () => {
  for (const recipe of [stoneMill(), mill()]) {
    const mesh = compileAsset(recipe);
    assert.ok(mesh.normals.some((_, i) => i % 3 === 0 && mesh.normals[i] > 0.9));
    assert.ok(mesh.normals.some((_, i) => i % 3 === 2 && mesh.normals[i] < -0.9));
    for (let turn = 0; turn < 4; turn++)
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const angle = (turn * Math.PI) / 2;
        const x = mesh.positions[i],
          z = mesh.positions[i + 2];
        assert.ok(
          Math.abs(x * Math.cos(angle) + z * Math.sin(angle)) <=
            recipe.footprint[turn % 2] / 2 + 1e-6,
        );
        assert.ok(
          Math.abs(-x * Math.sin(angle) + z * Math.cos(angle)) <=
            recipe.footprint[(turn + 1) % 2] / 2 + 1e-6,
        );
      }
  }
});

test('harvested rice, milled rice and flour are separate, finite product silhouettes', () => {
  const products = [riceProductUnit(), grainProductUnit('milledRice'), grainProductUnit('flour')];
  assert.equal(new Set(products.map((parts) => JSON.stringify(parts))).size, 3);
  assert.ok(products[0].some((p) => p.name === 'rice-sheaf-twine'));
  assert.ok(products[1].some((p) => p.name === 'milled-rice-grain'));
  assert.ok(products[2].some((p) => p.name === 'flour-mound'));
  for (const parts of products) {
    const mesh = compileAsset({ id: 'product', footprint: [1, 1], parts });
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.ok(mesh.indices.length > 0);
  }
});

test('canonical runtime and export catalogs register the complete rice and mill route', () => {
  for (const id of [
    'stone-mill',
    'mill',
    'pile-rice-1',
    'pile-rice-10',
    'pile-milledRice-1',
    'pile-flour-1',
  ])
    assert.ok(ASSETS[id], `${id} must be usable in the game, not just an isolated art recipe`);
  for (const stage of ['seedling', 'young', 'ready']) {
    const recipe = ASSETS[`crop-cell-rice-${stage}`];
    assert.ok(recipe);
    assert.deepEqual(recipe.parts, riceGeometry(stage));
  }
  assert.ok(ASSETS['pile-rice-1'].parts.some((p) => p.name.includes('rice-harvested-grain')));
  assert.ok(ASSETS['pile-milledRice-1'].parts.some((p) => p.name.includes('milled-rice-grain')));
  assert.ok(ASSETS['pile-flour-1'].parts.some((p) => p.name.includes('flour-mound')));
  assert.deepEqual(ASSETS.mill.parts, mill().parts);
});
