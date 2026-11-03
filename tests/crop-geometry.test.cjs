const test = require('node:test');
const assert = require('node:assert/strict');
const { cropCell, farmBed } = require('../.domain-build/art/FarmCellKit');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { PLANT_SHAPES } = require('../.domain-build/art/PlantShapes');
test('grain and fern surfaces use shared smooth vertices and have distinct organic contours', () => {
  for (const shape of ['grain', 'kernel', 'ribbon', 'frond']) {
    const mesh = compileAsset({
      id: 'sample',
      footprint: [1, 1],
      parts: [{ name: shape, shape, position: [0, 0, 0], size: [1, 1, 1], color: '#DDBB66' }],
    });
    assert.equal(mesh.positions.length / 3, PLANT_SHAPES[shape].vertices.length);
    assert.ok(mesh.indices.length > mesh.positions.length, 'indexed surfaces share their vertices');
    assert.ok(mesh.normals.every(Number.isFinite));
  }
  const wheat = cropCell('ready', 'wheat');
  assert.ok(wheat.parts.filter((p) => p.name === 'wheat-ear').every((p) => p.shape === 'kernel'));
  assert.ok(!wheat.parts.some((p) => p.shape === 'gem'), 'no pyramid grain chains');
  assert.ok(
    wheat.parts.filter((p) => p.name === 'wheat-stem').length >= 60,
    'dense cereal planting',
  );
  assert.ok(
    wheat.parts
      .filter((p) => p.name === 'wheat-ear')
      .every((p) => p.size[0] <= 0.025 && p.size[1] > p.size[0] * 2),
    'slim wheat grains',
  );
  assert.ok(
    wheat.parts.filter((p) => p.name === 'wheat-narrow-leaf').every((p) => p.size[0] < 0.025),
    'no broad corn leaves',
  );
  const carrots = cropCell('ready', 'vegetable');
  assert.ok(carrots.parts.some((p) => p.shape === 'frond'));
  assert.ok(
    !carrots.parts.some((p) => p.shape === 'gem' || p.shape === 'blade'),
    'no diamond or spear foliage',
  );
  assert.deepEqual(wheat, cropCell('ready', 'wheat'));
});
test('three stages have distinct silhouettes and only mature plants expose grain or roots', () => {
  for (const crop of ['wheat', 'vegetable', 'lettuce']) {
    const stages = ['seedling', 'young', 'ready'].map((s) => cropCell(s, crop));
    const heights = stages.map((s) => compileAsset(s).max[1]);
    assert.ok(heights[0] < heights[1] && heights[1] < heights[2], crop);
    assert.equal(new Set(stages.map((s) => JSON.stringify(s.parts))).size, 3);
    for (const s of stages.slice(0, 2))
      assert.ok(!s.parts.some((p) => p.name === 'wheat-ear' || p.name === 'carrot-root'));
  }
});
test('sixteen full fields have bounded geometry and small shared indexed crop buffers', () => {
  const bed = compileAsset(farmBed()).indices.length / 3;
  for (const [crop, cap] of [
    ['wheat', 920000],
    ['vegetable', 430000],
  ]) {
    const mesh = compileAsset(cropCell('ready', crop));
    assert.ok(16 * (bed + (9 * mesh.indices.length) / 3) < cap);
    const bytes =
      4 * (mesh.positions.length + mesh.normals.length + mesh.colors.length + mesh.indices.length);
    assert.ok(bytes < 400000, `${crop}: ${bytes} shared bytes`);
  }
});
