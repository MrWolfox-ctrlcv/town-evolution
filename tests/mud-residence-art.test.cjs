const test = require('node:test');
const assert = require('node:assert/strict');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { productPile } = require('../.domain-build/art/ProductPileKit');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');

test('mud has nine distinct low grounded models, classified as natural material', () => {
  const drySoilColors = new Set(productPile('soil', 1).parts.map((p) => p.color));
  for (let amount = 1; amount <= 9; amount++) {
    const asset = ASSETS[`pile-mud-${amount}`];
    assert.equal(asset.category, 'natural-inorganic');
    assert.equal(asset.parts.filter((p) => p.name.endsWith('-wet-clay')).length, amount);
    assert.ok(asset.parts.every((p) => !drySoilColors.has(p.color)));
    const mesh = compileAsset(asset);
    assert.equal(mesh.min[1], 0);
    assert.ok(mesh.max[1] < 0.2, 'clay spreads flat rather than becoming a tall pyramid');
    assert.ok(mesh.min[0] >= -0.5 && mesh.max[0] <= 0.5);
    assert.ok(mesh.min[2] >= -0.5 && mesh.max[2] <= 0.5);
    assert.ok(mesh.indices.length / 3 < 6000);
    assert.equal(
      asset.parts.some((p) => p.name.endsWith('-land-moss')),
      amount === 9,
    );
  }
  assert.equal(ASSETS['pile-mud-10'], undefined);
});

test('nine mud units form an aligned three-by-three land pad without text', () => {
  const asset = ASSETS['pile-mud-9'];
  const blocks = asset.parts.filter((p) => p.name.endsWith('-wet-clay'));
  const xs = new Set(blocks.map((p) => p.position[0]));
  const zs = new Set(blocks.map((p) => p.position[2]));
  assert.equal(xs.size, 3);
  assert.equal(zs.size, 3);
  assert.equal(new Set(blocks.map((p) => p.position[1])).size, 1);
  assert.equal(new Set(blocks.map((p) => `${p.position[0]}:${p.position[2]}`)).size, 9);
  assert.ok(blocks.every((p) => p.rotation.every((angle) => angle === 0)));
  assert.ok(asset.parts.every((p) => !/text|label|badge|number/i.test(p.name)));
});

test('residence keeps house geometry and sockets, with a finished plaster-home silhouette', () => {
  const base = ASSETS.house;
  const asset = ASSETS.residence;
  assert.equal(asset.category, 'buildings');
  assert.deepEqual(asset.footprint, base.footprint);
  assert.deepEqual(asset.sockets, base.sockets);
  for (const name of ['cream-walls', 'gable-wall', 'terracotta-gable', 'roof-ridge', 'home-door']) {
    const original = base.parts.find((p) => p.name === name);
    const upgraded = asset.parts.find((p) => p.name === name);
    assert.deepEqual(upgraded.size, original.size);
    assert.deepEqual(upgraded.position, original.position);
  }
  assert.notEqual(
    asset.parts.find((p) => p.name === 'cream-walls').color,
    base.parts.find((p) => p.name === 'cream-walls').color,
  );
  assert.ok(asset.parts.some((p) => p.name === 'residence-front-shutter'));
  assert.ok(asset.parts.some((p) => p.name === 'residence-window-flower'));
  assert.ok(asset.parts.some((p) => p.name === 'residence-gable-plaster'));
  const mesh = compileAsset(asset);
  assert.ok(mesh.min[0] >= -1 && mesh.max[0] <= 1);
  assert.ok(mesh.min[2] >= -1 && mesh.max[2] <= 1);
  assert.ok(mesh.min[1] >= 0);
  assert.ok(mesh.indices.length / 3 < 2500);
  assert.ok(mesh.positions.every(Number.isFinite));
});
