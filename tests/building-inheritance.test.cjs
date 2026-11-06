const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { woodenBoard, woodenCrate, mount } = require('../.domain-build/art/BuildingAccessories');
const { move } = require('../.domain-build/art/AssetTypes');

test('house upgrades retain the exact door, roof, walls and chimney instead of unrelated replacement models', () => {
  for (const id of ['shop', 'warehouse-base', 'warehouse-expanded', 'warehouse-cold']) {
    for (const name of [
      'home-door',
      'home-door-frame',
      'roof-ridge',
      'roof-tile',
      'cream-walls',
      'home-window-frame',
      'home-chimney',
    ]) {
      const inherited = ASSETS[id].parts.filter((p) => p.name === name);
      assert.ok(inherited.length, `${id}/${name}`);
      assert.deepEqual(
        inherited,
        ASSETS.house.parts.filter((p) => p.name === name),
        `${id}/${name}`,
      );
    }
  }
});

test('notice board is mounted intact as the shop sign and open crates are reused in warehouse', () => {
  assert.deepEqual(ASSETS['order-board'].parts, woodenBoard());
  const sign = mount(woodenBoard(), [0.42, 0.73, -0.08], 90, 0.92);
  for (const p of sign)
    assert.ok(
      ASSETS.shop.parts.some((candidate) => JSON.stringify(candidate) === JSON.stringify(p)),
    );
  assert.deepEqual(ASSETS.crate.parts, woodenCrate());
  const crate = move(woodenCrate(), [0.63, 0.29, -0.36], 0.65);
  for (const p of crate)
    assert.ok(
      ASSETS['warehouse-base'].parts.some(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(p),
      ),
    );
  assert.ok(
    !ASSETS.crate.parts.some((p) => p.name === 'crate-body'),
    'crate is open geometry, not a closed solid cube',
  );
});

test('generated wood uses real UVs, distinct indexed material batches and a verified shared PNG', () => {
  const png = fs.readFileSync('assets/resources/buildings/warm-wood.png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1254);
  assert.equal(png.readUInt32BE(20), 1254);
  assert.ok(png.equals(fs.readFileSync('art/exports/textures/warm-wood.png')));
  for (const id of ['shop', 'warehouse-base', 'crate', 'order-board']) {
    const mesh = compileAsset(ASSETS[id]);
    assert.equal(mesh.uvs.length, (mesh.positions.length / 3) * 2);
    assert.ok(mesh.uvs.every(Number.isFinite));
    assert.ok(mesh.texturedIndices.length > 0 && mesh.texturedIndices.length < mesh.indices.length);
    const g = JSON.parse(fs.readFileSync(`art/exports/${id}.gltf`, 'utf8'));
    assert.equal(g.meshes[0].primitives.length, 2);
    assert.equal(g.materials[1].pbrMetallicRoughness.baseColorTexture.index, 0);
    assert.equal(g.images[0].uri, 'textures/warm-wood.png');
    const primitives = g.meshes[0].primitives;
    assert.equal(
      primitives.reduce((sum, p) => sum + g.accessors[p.indices].count, 0),
      mesh.indices.length,
    );
    assert.equal(g.accessors[primitives[1].attributes.TEXCOORD_0].count, mesh.positions.length / 3);
  }
});

test('new geometry has side and back surfaces and all four rotations stay in the existing footprints', () => {
  for (const id of [
    'house',
    'shop',
    'warehouse-base',
    'warehouse-expanded',
    'order-board',
    'crate',
  ]) {
    const mesh = compileAsset(ASSETS[id]);
    assert.ok(mesh.normals.some((_, i) => i % 3 === 2 && mesh.normals[i] < -0.9));
    assert.ok(mesh.normals.some((_, i) => i % 3 === 0 && mesh.normals[i] > 0.9));
    for (let turn = 0; turn < 4; turn++)
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i],
          z = mesh.positions[i + 2],
          angle = (turn * Math.PI) / 2;
        assert.ok(
          Math.abs(x * Math.cos(angle) + z * Math.sin(angle)) <=
            ASSETS[id].footprint[turn % 2] / 2 + 1e-6,
          `${id}/${turn}`,
        );
        assert.ok(
          Math.abs(-x * Math.sin(angle) + z * Math.cos(angle)) <=
            ASSETS[id].footprint[(turn + 1) % 2] / 2 + 1e-6,
          `${id}/${turn}`,
        );
      }
  }
});

test('the established 53-part house keeps its original geometry, palette and narrow doorway', () => {
  const original = JSON.parse(fs.readFileSync('tests/fixtures/established-house.json', 'utf8'));
  assert.deepEqual(ASSETS.house, original);
  assert.equal(ASSETS.house.parts.length, 53);
  assert.ok(ASSETS.house.parts.every((p) => !p.texture));
  assert.equal(ASSETS.house.parts.find((p) => p.name === 'home-door').shape, 'box');
  assert.deepEqual(
    ASSETS.house.parts.find((p) => p.name === 'home-door').position,
    [-0.48, 0.6, 0.62],
  );
  assert.equal(ASSETS.house.parts.find((p) => p.name === 'roof-ridge').color, '#A84D31');
});

test('shared wood material enables its texture before loading and has an actual brown fallback', () => {
  const source = fs.readFileSync('assets/scripts/presentation/BuildingTexture.ts', 'utf8');
  assert.match(source, /readonly material = worldMaterial\(true, true\)/);
  const material = fs.readFileSync('assets/scripts/presentation/WorldMaterial.ts', 'utf8');
  assert.match(material, /USE_ALBEDO_MAP: textured/);
  assert.match(source, /fallback\.uploadData\(new Uint8Array\(\[183, 126, 67, 255\]\)\)/);
  assert.ok(
    source.indexOf("setProperty('mainTexture', this.fallback)") < source.indexOf('const done'),
  );
  assert.ok(
    !source.includes('this.material.recompileShaders('),
    'Cocos Material only warns; no shader change occurs',
  );
  assert.match(source, /this\.material\.setProperty\('mainTexture', this\.texture\)/);
  const compiler = fs.readFileSync('assets/scripts/art/MeshCompiler.ts', 'utf8');
  assert.ok(
    !compiler.includes("recipe.category === 'buildings' ? 0.72"),
    'do not brighten all building surfaces',
  );
});
