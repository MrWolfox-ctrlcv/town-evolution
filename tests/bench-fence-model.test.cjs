/** Canonical geometry and production factory/picking on CPU; not a WebGL rendering test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { environment } = require('../.domain-build/art/EnvironmentKit');
const { buildingAssetId } = require('../.domain-build/art/BuildingAssets');
const { handbookAsset } = require('../.domain-build/art/HandbookAssets');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { factory, ModelPicking, worldSurface } = require('./helpers/model-factory-ui.cjs');

test('fence and bench use one canonical asset for the town and handbook', () => {
  for (const kind of ['fence', 'bench']) {
    const id = kind === 'fence' ? 'crafted-fence' : kind;
    assert.ok(ASSETS[id], kind);
    assert.equal(buildingAssetId({ kind }, 0), id);
    assert.strictEqual(handbookAsset(kind), ASSETS[id]);
    assert.deepEqual(ASSETS[id].footprint, [1, 1]);
    assert.equal(ASSETS[id].category, 'buildings');
  }
  assert.deepEqual(ASSETS.fence.parts, environment('fence').parts);
});

test('bench has separately readable seats, back, four legs and braces with shared wood UVs', () => {
  const bench = ASSETS.bench;
  assert.ok(bench, 'canonical bench');
  const count = (name) => bench.parts.filter((p) => p.name === name).length;
  assert.equal(count('bench-seat-plank'), 3);
  assert.equal(count('bench-back-plank'), 2);
  assert.equal(count('bench-leg'), 4);
  assert.equal(count('bench-side-brace'), 2);
  assert.equal(count('bench-cross-brace'), 1);
  const legWidth = bench.parts.find((p) => p.name === 'bench-leg').size[0];
  for (const brace of bench.parts.filter((p) => p.name === 'bench-side-brace'))
    assert.ok(brace.size[0] < legWidth, 'Brace side faces must be inset, not coplanar with legs');
  assert.ok(bench.parts.every((p) => p.texture === 'warm-wood'));
  const mesh = compileAsset(bench);
  assert.ok(mesh.texturedIndices.length > 0);
  assert.equal(mesh.texturedIndices.length, mesh.indices.length);
  assert.equal(mesh.uvs.length, (mesh.positions.length / 3) * 2);
  assert.ok(mesh.uvs.every((u) => Number.isFinite(u) && u >= 0 && u <= 1));
  assert.ok(mesh.indices.length / 3 < 3000);
  assert.ok(mesh.min[0] >= -0.5 && mesh.max[0] <= 0.5);
  assert.ok(mesh.min[2] >= -0.5 && mesh.max[2] <= 0.5);
  assert.ok(Math.abs(mesh.min[1]) < 1e-8);
});

test('actual factory rotates and places both models and real mesh picking follows their geometry', () => {
  const f = factory();
  for (const kind of ['fence', 'bench']) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const b = { id: `${kind}-${rotation}`, kind, x: 4, z: 5, rotation };
      const root = f.building(b, 0, 1, 3, [], 0.3);
      assert.deepEqual(root.position, [4.5, 0.3, 5.5]);
      const surface = worldSurface(root.getChildByName('BuildingMesh'));
      assert.ok(surface.bounds.min[0] >= 4 && surface.bounds.max[0] <= 5);
      assert.ok(surface.bounds.min[2] >= 5 && surface.bounds.max[2] <= 6);
      const ray = { o: { x: 4.5, y: 4, z: 5.5 }, d: { x: 0, y: -1, z: 0 } };
      assert.ok(new ModelPicking(root).distance(ray) > 0, `${kind} rotation ${rotation}`);
    }
  }
  assert.deepEqual([...f.assets.meshes.keys()].sort(), ['bench', 'crafted-fence']);
  f.dispose();
});
