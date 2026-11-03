const { test } = require('node:test');
const assert = require('node:assert/strict');
const { farmCellAt } = require('../.domain-build/application/FarmCells.js');
const farm = { id: 'f', kind: 'farm', x: 4, z: 6, rotation: 0 };
test('all nine soil cell centers are distinct and row-major', () => {
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      assert.equal(
        farmCellAt(farm, { x: 4 + ((col + 0.5) * 2) / 3, z: 6 + ((row + 0.5) * 2) / 3 }),
        row * 3 + col,
      );
});
test('rotated farm keeps local cell identity under inverse yaw', () => {
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      const x = ((col + 0.5) * 2) / 3 - 1,
        z = ((row + 0.5) * 2) / 3 - 1;
      assert.equal(farmCellAt({ ...farm, rotation: 1 }, { x: 5 + z, z: 7 - x }), row * 3 + col);
    }
});
test('outside, non-farm and invalid points cannot target a cell', () => {
  for (const p of [
    { x: 3.99, z: 7 },
    { x: 6, z: 7 },
    { x: 5, z: 8 },
    { x: NaN, z: 7 },
  ])
    assert.equal(farmCellAt(farm, p), null);
  assert.equal(farmCellAt({ ...farm, kind: 'warehouse' }, { x: 5, z: 7 }), null);
});

const { farmStages, farmBed, cropCell } = require('../.domain-build/art/FarmCellKit.js');
test('cell visual stages change independently and preserve monotonic maturity', () => {
  const jobs = Array(9).fill(null);
  jobs[0] = { id: 'j1', startedAt: 0, readyAt: 15000 };
  jobs[8] = { id: 'j2', startedAt: 10000, readyAt: 25000 };
  const stages = farmStages(jobs, 15000);
  assert.equal(stages[0], 'ready');
  assert.equal(stages[8], 'seedling');
  assert.equal(stages[4], 'empty');
  jobs[0] = null;
  assert.equal(farmStages(jobs, 15000)[0], 'empty');
  assert.equal(farmStages(jobs, 15000)[8], 'seedling');
  assert.equal(farmStages(jobs, Math.max(0, 25000))[8], 'ready');
});
test('canonical soil cells align with input centers and fit individual crop meshes', () => {
  const bed = farmBed();
  const soils = bed.parts.filter((part) => part.name.startsWith('soil-'));
  assert.equal(soils.length, 9);
  for (let cell = 0; cell < 9; cell++) {
    const p = soils[cell].position;
    assert.equal(farmCellAt({ ...farm, x: -1, z: -1 }, { x: p[0], z: p[2] }), cell);
    assert.ok(Math.abs(soils[cell].position[1] + soils[cell].size[1] / 2 - 0.17) < 1e-9);
  }
  for (const stage of ['seedling', 'young', 'ready'])
    for (const part of cropCell(stage).parts)
      assert.ok(
        Math.abs(part.position[0]) + part.size[0] / 2 < 1 / 3,
        'Crop remains within one cell',
      );
});

const { farmVisuals } = require('../.domain-build/art/FarmCellKit.js');
const { ASSETS } = require('../.domain-build/art/AssetCatalog.js');
test('crop identity is independently represented and old jobs remain carrots', () => {
  const job = { id: 'j', startedAt: 0, readyAt: 100 };
  const jobs = [job, { ...job, crop: 'wheat' }, { ...job, crop: 'lettuce' }];
  assert.deepEqual(farmVisuals(jobs, 100).slice(0, 4), [
    'vegetable-ready',
    'wheat-ready',
    'lettuce-ready',
    'empty',
  ]);
  assert.notEqual(farmVisuals([{ ...job, crop: 'wheat' }], 0)[0], farmVisuals([job], 0)[0]);
});
test('all crop stages have distinct canonical meshes inside their soil cell', () => {
  const readyShapes = new Set();
  for (const crop of ['vegetable', 'wheat', 'lettuce']) {
    for (const stage of ['seedling', 'young', 'ready']) {
      const recipe = cropCell(stage, crop);
      assert.deepEqual(ASSETS[recipe.id], recipe);
      for (const part of recipe.parts) {
        assert.ok(Math.abs(part.position[0]) + part.size[0] / 2 < 1 / 3);
        assert.ok(Math.abs(part.position[2]) + part.size[2] / 2 < 1 / 3);
        assert.ok(part.position[1] + part.size[1] / 2 > 0.17, 'Every crop part rises above soil');
      }
      if (stage === 'ready') readyShapes.add(JSON.stringify(recipe.parts));
    }
  }
  assert.equal(readyShapes.size, 3);
  assert.ok(cropCell('ready', 'vegetable').parts.some((p) => p.name === 'carrot-root'));
  assert.ok(cropCell('ready', 'wheat').parts.some((p) => p.name === 'wheat-ear'));
  assert.ok(cropCell('ready', 'lettuce').parts.some((p) => p.name === 'lettuce-heart'));
});

const { compileAsset } = require('../.domain-build/art/MeshCompiler');
test('full crop meshes including rotated leaves stay inside each independent cell', () => {
  for (const crop of ['vegetable', 'wheat', 'lettuce'])
    for (const stage of ['seedling', 'young', 'ready']) {
      const mesh = compileAsset(cropCell(stage, crop));
      for (const axis of [0, 2]) {
        assert.ok(mesh.min[axis] >= -1 / 3, `${crop}-${stage} minimum`);
        assert.ok(mesh.max[axis] <= 1 / 3, `${crop}-${stage} maximum`);
      }
      const budget = crop === 'vegetable' ? 3000 : crop === 'wheat' ? 6500 : 500;
      assert.ok(
        mesh.indices.length / 3 <= budget,
        `${crop}-${stage} stays under explicit crop mesh budget`,
      );
    }
  assert.equal(farmBed().parts.filter((p) => p.name === 'soft-soil-ridge').length, 27);
  assert.ok(!farmBed().parts.some((p) => p.name.startsWith('cell-grid')));
});
