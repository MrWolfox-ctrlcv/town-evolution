const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nursery, sapling, saplingProductUnit } = require('../.domain-build/art/NurseryKit.js');
const { woodenCrate } = require('../.domain-build/art/BuildingAccessories.js');
const { compileAsset } = require('../.domain-build/art/MeshCompiler.js');

test('each nursery state keeps every original crate board, corner post, pin and texture', () => {
  const crate = woodenCrate();
  for (const stage of ['empty', 'seeded', 'growing', 'ready']) {
    const recipe = nursery(stage);
    assert.deepEqual(recipe.parts.slice(0, crate.length), crate);
    assert.deepEqual(recipe.footprint, [1, 1]);
    assert.equal(recipe.id, `nursery-${stage}`);
    assert.equal(recipe.parts.filter((p) => p.name === 'nursery-mud-fill').length, 1);
    assert.ok(recipe.parts.some((p) => p.name === 'crate-post'));
    assert.ok(recipe.parts.some((p) => p.name === 'crate-iron-pin'));
    assert.ok(recipe.parts.some((p) => p.name === 'crate-slat-front' && p.texture === 'warm-wood'));
  }
});

test('nursery states are distinct and one watered tree seed grows into one progressively larger shoot', () => {
  const recipes = ['empty', 'seeded', 'growing', 'ready'].map(nursery);
  assert.equal(new Set(recipes.map((r) => JSON.stringify(r.parts))).size, 4);
  for (const recipe of recipes.slice(0, 2))
    assert.equal(recipe.parts.filter((p) => p.name === 'sapling-main-stem').length, 0);
  assert.equal(recipes[1].parts.filter((p) => p.name === 'nursery-tree-seed').length, 1);
  for (const recipe of recipes.slice(2))
    assert.equal(recipe.parts.filter((p) => p.name === 'sapling-main-stem').length, 1);
  assert.equal(recipes[2].parts.filter((p) => p.name === 'sapling-broad-leaf').length, 2);
  assert.equal(recipes[3].parts.filter((p) => p.name === 'sapling-broad-leaf').length, 4);
  assert.ok(compileAsset(recipes[2]).max[1] < compileAsset(recipes[3]).max[1]);
});

test('nurseries and root-ball sapling produce finite bounded geometry in all four rotations', () => {
  for (const recipe of [...['empty', 'seeded', 'growing', 'ready'].map(nursery), sapling()]) {
    const mesh = compileAsset(recipe);
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.ok(mesh.normals.every(Number.isFinite));
    assert.ok(mesh.indices.length > 0);
    assert.ok(mesh.indices.length / 3 < 5000);
    assert.ok(mesh.min[1] >= -1e-6);
    for (let turn = 0; turn < 4; turn++)
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const angle = (turn * Math.PI) / 2,
          x = mesh.positions[i],
          z = mesh.positions[i + 2];
        assert.ok(Math.abs(x * Math.cos(angle) + z * Math.sin(angle)) <= 0.5);
        assert.ok(Math.abs(-x * Math.sin(angle) + z * Math.cos(angle)) <= 0.5);
      }
  }
  assert.deepEqual(sapling().parts, saplingProductUnit());
  assert.equal(sapling().parts.filter((p) => p.name === 'sapling-root-ball').length, 1);
});
